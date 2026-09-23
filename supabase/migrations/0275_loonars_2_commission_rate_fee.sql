-- ============================================================================
-- MK Connect — 0275: auto-calculate Loonars 2 fee from a per-sales commission
-- rate, instead of letting the rep type any amount
--
-- Owner's explicit correction: "harusnya jangan biarkan dia isi sendiri, dong
-- langsung hitung otomatis saja dari harga total, khusus Yudha feenya adalah
-- 8%". Two pieces:
--
--   1. loonars_sales_commission_rates -- admin-managed, one row per employee
--      (not hardcoded here -- like 0266's notary contact, a specific
--      employee's commission percentage is compensation data that has no
--      business sitting in this repo's public git history; the owner sets
--      Yudha's 8% herself at /siteplan/admin once this ships).
--
--   2. loonars_projects.fee_rate_based (same per-project-toggle pattern as
--      0265's publicly_shareable and 0274's fee_claimable_at_dp) -- true
--      only for Loonars 2, per the owner's explicit scoping. When true,
--      loonars_unit_fee_request ignores whatever p_fee_amount the client
--      sends and computes round(purchase.price * rate / 100) itself,
--      raising a clear error if the rep has no rate configured yet. Every
--      other project (Cendana/Makassar) keeps the original free-text
--      manual-amount flow untouched -- p_fee_amount stays required there.
-- ============================================================================

alter table public.loonars_projects add column fee_rate_based boolean not null default false;

comment on column public.loonars_projects.fee_rate_based is
  'When true, loonars_unit_fee_request (0275) computes the fee itself as round(purchase.price * commission_rate_percent / 100) from loonars_sales_commission_rates, ignoring any client-supplied amount. Owner''s explicit call, Loonars 2 only for now -- every other project keeps the original manual-amount flow.';

update public.loonars_projects set fee_rate_based = true where kode = 'LNR2';

-- ----------------------------------------------------------------------------
-- loonars_sales_commission_rates -- admin-managed, one row per employee
-- ----------------------------------------------------------------------------
create table public.loonars_sales_commission_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  commission_rate_percent numeric not null check (commission_rate_percent > 0 and commission_rate_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loonars_sales_commission_rates enable row level security;

-- An employee can see their own rate (so the fee card can show "Fee (8%):
-- Rp X" before they submit); only siteplan.manage can see/manage everyone
-- else's, and only siteplan.manage can write.
create policy "loonars_sales_commission_rates_select" on public.loonars_sales_commission_rates
  for select to authenticated
  using (employee_id = auth.uid() or public.app_has_permission('siteplan.manage'));
create policy "loonars_sales_commission_rates_insert" on public.loonars_sales_commission_rates
  for insert to authenticated
  with check (public.app_has_permission('siteplan.manage'));
create policy "loonars_sales_commission_rates_update" on public.loonars_sales_commission_rates
  for update to authenticated
  using (public.app_has_permission('siteplan.manage'))
  with check (public.app_has_permission('siteplan.manage'));

drop trigger if exists loonars_sales_commission_rates_set_updated_at on public.loonars_sales_commission_rates;
create trigger loonars_sales_commission_rates_set_updated_at
  before update on public.loonars_sales_commission_rates
  for each row execute function public.set_updated_at();

comment on table public.loonars_sales_commission_rates is
  'Admin-managed per-employee commission rate for the fee_rate_based fee-calculation path (0275). No row is seeded by this migration -- a siteplan.manage holder sets each rep''s rate at /siteplan/admin after deploy (e.g. Wahyudha Wibisono at 8%).';

-- ----------------------------------------------------------------------------
-- loonars_unit_fee_request -- now computes the amount itself for a
-- fee_rate_based project, instead of trusting the client-supplied one
-- ----------------------------------------------------------------------------
create or replace function public.loonars_unit_fee_request(p_purchase_id uuid, p_fee_amount numeric default null, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_purchases%rowtype;
  v_unit public.loonars_units%rowtype;
  v_fee_claimable_at_dp boolean;
  v_fee_rate_based boolean;
  v_commission_rate numeric;
  v_fee_amount numeric;
  v_fee_id uuid;
  v_admin record;
begin
  select * into v_row from public.loonars_unit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Purchase not found';
  end if;
  if v_row.marketing_employee_id is distinct from v_user_id then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_row.status <> 'verified' then
    raise exception 'Belum terverifikasi';
  end if;

  select * into v_unit from public.loonars_units where id = v_row.unit_id;
  select fee_claimable_at_dp, fee_rate_based into v_fee_claimable_at_dp, v_fee_rate_based
  from public.loonars_projects where id = v_unit.project_id;

  -- 0274: a project opted into fee_claimable_at_dp accepts dp or akad; every
  -- other project keeps 0204's original akad-only rule.
  if coalesce(v_fee_claimable_at_dp, false) then
    if v_row.transaction_type not in ('dp', 'akad') then
      raise exception 'Fee hanya bisa diajukan setelah pembayaran DP atau lunas (akad)';
    end if;
  else
    if v_row.transaction_type <> 'akad' then
      raise exception 'Fee hanya bisa diajukan setelah pembayaran lunas (akad)';
    end if;
  end if;

  -- 0275: a fee_rate_based project computes its own amount and ignores
  -- whatever p_fee_amount the client sent; every other project still
  -- requires the rep to supply a valid manual amount.
  if coalesce(v_fee_rate_based, false) then
    select commission_rate_percent into v_commission_rate
    from public.loonars_sales_commission_rates where employee_id = v_user_id;
    if v_commission_rate is null then
      raise exception 'Rate komisi Anda belum diatur -- hubungi admin untuk mengatur persentase fee Anda';
    end if;
    if v_row.price is null or v_row.price <= 0 then
      raise exception 'Harga unit belum diisi pada pembelian ini';
    end if;
    v_fee_amount := round(v_row.price * v_commission_rate / 100);
  else
    v_fee_amount := p_fee_amount;
    if v_fee_amount is null or v_fee_amount <= 0 then
      raise exception 'Nominal fee tidak valid';
    end if;
  end if;

  if exists (
    select 1 from public.loonars_unit_fee_requests
    where purchase_id = p_purchase_id and status <> 'rejected'
  ) then
    raise exception 'Fee sudah diajukan';
  end if;

  insert into public.loonars_unit_fee_requests (purchase_id, unit_id, marketing_employee_id, fee_amount, phone)
  values (p_purchase_id, v_row.unit_id, v_user_id, v_fee_amount, p_phone)
  returning id into v_fee_id;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'loonars_fee_alert',
      'Pengajuan Fee Siteplan — Unit ' || coalesce(v_unit.blok, '-'),
      'Marketing mengajukan fee untuk unit ' || coalesce(v_unit.blok, '-')
        || E'\nPembeli: ' || coalesce(v_row.buyer_name, '-')
        || E'\nNilai fee: Rp ' || to_char(v_fee_amount, 'FM999,999,999,999'),
      '/siteplan/fee-requests',
      jsonb_build_object('loonars_unit_fee_request_id', v_fee_id, 'unit_id', v_row.unit_id)
    );
  end loop;

  return v_fee_id;
end;
$$;

comment on function public.loonars_unit_fee_request is
  'The marketing rep who owns a verified purchase claims their fee. Raises if the caller is not the owning rep or the purchase is not verified. Transaction-type gate (0274): fee_claimable_at_dp accepts dp or akad; otherwise only akad. Amount (0275): a fee_rate_based project (Loonars 2) computes round(price * commission_rate_percent / 100) itself from loonars_sales_commission_rates, ignoring p_fee_amount; every other project requires a valid p_fee_amount from the caller. Also raises if a live (non-rejected) fee request already exists. Alerts every active super_admin.';

revoke all on function public.loonars_unit_fee_request(uuid, numeric, text) from public, anon;
