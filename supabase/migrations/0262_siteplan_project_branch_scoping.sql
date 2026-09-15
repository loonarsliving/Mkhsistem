-- ============================================================================
-- MK Connect — 0262: siteplan projects are scoped to their own branch
--
-- Owner's explicit call: "untuk loonars 2, kunci hanya untuk jogja" -- Loonars
-- 2 must be locked to Jogja only. 0261 widened siteplan.view to Jogja by
-- adding JOGJA_BRANCH_ID next to MAKASSAR_BRANCH_ID in
-- constants/app.ts#SITEPLAN_BRANCH_IDS, but that permission is a blanket
-- on/off switch checked once at session load -- it says nothing about which
-- PROJECT a viewer may see. Without this migration, listSiteplanProjects()
-- (using(true) since 0202) hands every Sales/Kepala Cabang holder of
-- siteplan.view every project regardless of branch: Makassar's own project
-- ("Cendana") would appear for Jogja reps, and Loonars 2 would appear for
-- Makassar reps. This migration makes each project branch-exclusive instead.
--
-- Adds loonars_projects.branch_id (not null after backfill: existing
-- "Cendana" -> Makassar since 0202 was explicitly a Makassar-only build;
-- "LNR2" -> Jogja per the owner). Scopes the SELECT RLS policies on
-- loonars_projects and loonars_units to the caller's own branch, and adds
-- the matching check inside loonars_unit_purchase_submit -- so this is a
-- real access boundary (RLS + RPC), not just what the UI happens to fetch,
-- per this project's "always add both layers" rule.
--
-- Bypasses (both RLS and the RPC check), same audience each existing policy
-- already trusted company-wide:
--   * siteplan.manage (Super Admin / Direktur) -- unrestricted CRUD already.
--   * prospect.finance_verify (Finance) -- 0202's finance verification flow
--     is explicitly cross-branch (listPendingSiteplanPurchases has no branch
--     filter); without this bypass, embedding loonars_units/loonars_projects
--     inside that query would go blank for any purchase outside the
--     verifying Finance employee's own branch.
--
-- Future projects: the admin "Tambah Project" form now requires picking a
-- branch (features/siteplan/components/siteplan-project-form-dialog.tsx) --
-- there is no more "visible everywhere" default.
-- ============================================================================

alter table public.loonars_projects
  add column branch_id uuid references public.branches(id) on delete restrict;

update public.loonars_projects set branch_id = '40cdf547-d9cb-4d59-aba3-265a2ba04da8' where kode = 'Cendana'; -- Makassar
update public.loonars_projects set branch_id = 'fdeb7f3a-e211-4e6d-a2a6-35162378e3ae' where kode = 'LNR2';   -- Jogja

do $$
begin
  if exists (select 1 from public.loonars_projects where branch_id is null) then
    raise exception 'loonars_projects has rows with no branch_id after backfill -- add a case for the missing kode before making the column NOT NULL';
  end if;
end $$;

alter table public.loonars_projects alter column branch_id set not null;

create index loonars_projects_branch_idx on public.loonars_projects (branch_id);

comment on column public.loonars_projects.branch_id is
  'Which branch this siteplan project belongs to and is exclusively visible/bookable by (Sales/Kepala Cabang of any other branch cannot see it at all -- see loonars_projects_select/loonars_units_select below). Super Admin/Direktur (siteplan.manage) and Finance (prospect.finance_verify) see every project regardless.';

-- ----------------------------------------------------------------------------
-- Branch-scope the two catalog SELECT policies that were `using (true)`
-- since 0202. Replacing rather than editing the 0202 file, per this
-- project's "never edit a past migration" rule.
-- ----------------------------------------------------------------------------
drop policy if exists "loonars_projects_select" on public.loonars_projects;
create policy "loonars_projects_select" on public.loonars_projects
  for select to authenticated
  using (
    public.app_has_permission('siteplan.manage')
    or public.app_has_permission('prospect.finance_verify')
    or exists (
      select 1 from public.employees e
      where e.id = auth.uid() and e.branch_id = loonars_projects.branch_id
    )
  );

drop policy if exists "loonars_units_select" on public.loonars_units;
create policy "loonars_units_select" on public.loonars_units
  for select to authenticated
  using (
    public.app_has_permission('siteplan.manage')
    or public.app_has_permission('prospect.finance_verify')
    or exists (
      select 1
      from public.loonars_projects p
      join public.employees e on e.branch_id = p.branch_id
      where p.id = loonars_units.project_id and e.id = auth.uid()
    )
  );

comment on policy "loonars_projects_select" on public.loonars_projects is
  'Branch-exclusive since 0262: visible only to siteplan.manage, prospect.finance_verify, or an employee whose branch_id matches the project''s own branch_id.';
comment on policy "loonars_units_select" on public.loonars_units is
  'Branch-exclusive since 0262, mirroring loonars_projects_select through the parent project''s branch_id.';

-- ----------------------------------------------------------------------------
-- RPC-level enforcement: a Sales/Kepala Cabang employee can only submit a
-- purchase against a unit whose project belongs to their own branch. Same
-- siteplan.manage bypass as RLS above (an admin acting on someone's behalf
-- across branches is not blocked). Everything else in this function is
-- unchanged from 0204.
-- ----------------------------------------------------------------------------
create or replace function public.loonars_unit_purchase_submit(
  p_unit_id uuid,
  p_buyer_name text,
  p_nik text default null,
  p_phone text default null,
  p_address text default null,
  p_transaction_type text default 'booking',
  p_payment_method text default 'cash',
  p_price numeric default null,
  p_booking_fee numeric default null,
  p_dp_amount numeric default null,
  p_pelunasan_amount numeric default null,
  p_handover_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee record;
  v_unit public.loonars_units%rowtype;
  v_project_branch_id uuid;
  v_purchase_id uuid;
  v_recipient record;
begin
  select e.id, e.branch_id, e.full_name into v_employee
  from public.employees e
  where e.id = auth.uid() and e.deleted_at is null and e.employment_status = 'active';

  if v_employee.id is null then
    raise exception 'Karyawan tidak ditemukan atau tidak aktif' using errcode = '28000';
  end if;

  if p_buyer_name is null or btrim(p_buyer_name) = '' then
    raise exception 'Nama pembeli wajib diisi';
  end if;
  if p_transaction_type not in ('booking', 'dp', 'akad') then
    raise exception 'Tipe transaksi tidak valid';
  end if;
  if p_payment_method not in ('cash', 'kpr', 'both') then
    raise exception 'Metode pembayaran tidak valid';
  end if;

  select * into v_unit from public.loonars_units where id = p_unit_id for update;
  if not found then
    raise exception 'Unit tidak ditemukan';
  end if;

  select branch_id into v_project_branch_id from public.loonars_projects where id = v_unit.project_id;
  if v_project_branch_id is distinct from v_employee.branch_id and not public.app_has_permission('siteplan.manage') then
    raise exception 'Unit ini bukan bagian dari project cabang Anda' using errcode = '42501';
  end if;

  if v_unit.status <> 'tersedia' then
    raise exception 'Unit % sudah tidak tersedia (status: %)', v_unit.blok, v_unit.status;
  end if;

  insert into public.loonars_unit_purchases (
    unit_id, buyer_name, nik, phone, address, transaction_type, payment_method,
    price, booking_fee, dp_amount, pelunasan_amount, handover_date,
    marketing_employee_id, branch_id, notes
  ) values (
    p_unit_id, p_buyer_name, p_nik, p_phone, p_address, p_transaction_type, p_payment_method,
    p_price, p_booking_fee, p_dp_amount, p_pelunasan_amount, p_handover_date,
    v_employee.id, v_employee.branch_id, p_notes
  )
  returning id into v_purchase_id;

  update public.loonars_units set status = 'verifikasi', updated_at = now() where id = p_unit_id;

  -- Notify every active Super Admin, plus the unit's own branch's Kepala
  -- Cabang (0204 behaviour, unchanged).
  for v_recipient in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active'
      and (
        r.key = 'super_admin'
        or (r.key = 'kepala_cabang' and em.branch_id = v_employee.branch_id)
      )
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_recipient.id, 'system', 'loonars_fee_alert',
      'Siteplan: Unit Baru Diajukan — ' || v_unit.blok,
      coalesce(v_employee.full_name, '-') || ' mengajukan pembelian unit ' || v_unit.blok
        || E'\nPembeli: ' || p_buyer_name
        || E'\nTipe: ' || p_transaction_type || ', Metode: ' || p_payment_method
        || E'\nMohon verifikasi apakah dana sudah masuk.',
      '/crm/finance',
      jsonb_build_object('loonars_unit_purchase_id', v_purchase_id, 'unit_id', p_unit_id)
    );
  end loop;

  return v_purchase_id;
end;
$$;

comment on function public.loonars_unit_purchase_submit is
  'A marketing employee declares a buyer for an available unit. Resolves the caller via auth.uid() = employees.id, raises if the unit''s project belongs to a different branch than the caller''s (siteplan.manage holders bypass, 0262), raises if the unit is not currently tersedia (no double-booking), flips the unit to verifikasi, and alerts every active super_admin plus the submitting employee''s own branch Kepala Cabang (0204).';
