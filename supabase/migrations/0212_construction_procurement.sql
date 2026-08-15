-- Phase 5 (Procurement), scoped deliberately lean: a Purchase Request flags a
-- material need (informed by cm_material_requirement's shortage signal),
-- Super Admin/Finance approves or rejects it, and the ACTUAL purchase still
-- goes through construction_submit_expense (already built, already credits
-- stock) -- not a separate parallel PO/receiving pipeline. Building a second
-- procurement path alongside the one already in daily use would just be two
-- ways to do the same thing; instead construction_submit_expense gets one
-- new optional param to mark which PR a purchase fulfills.

create table public.cm_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  material_id uuid not null references public.cm_materials(id),
  requested_quantity numeric(14, 2) not null check (requested_quantity > 0),
  suggested_quantity numeric(14, 2),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'fulfilled')),
  requested_by uuid references public.employees(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.employees(id),
  decided_at timestamptz,
  reject_reason text,
  fulfilled_expense_id uuid references public.construction_expenses(id)
);
create index cm_purchase_requests_project_idx on public.cm_purchase_requests (project_id);

alter table public.cm_purchase_requests enable row level security;
create policy cm_purchase_requests_select on public.cm_purchase_requests for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_purchase_requests.project_id and e.id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- cm_submit_purchase_request(): requested_quantity > suggested_quantity
-- (from cm_material_requirement) requires a reason, per the approved
-- architecture's PR warning rule.
-- ----------------------------------------------------------------------------
create or replace function public.cm_submit_purchase_request(p_project_id uuid, p_material_id uuid, p_requested_quantity numeric, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_project_branch uuid;
  v_suggested numeric;
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_requested_quantity <= 0 then
    raise exception 'Jumlah harus lebih dari 0';
  end if;

  select branch_id into v_project_branch from public.construction_projects where id = p_project_id;
  if v_project_branch is null then
    raise exception 'Proyek tidak ditemukan';
  end if;
  select branch_id into v_caller_branch from public.employees where id = v_caller;
  if not public.app_has_permission('construction_finance.manage') and v_project_branch is distinct from v_caller_branch then
    raise exception 'Proyek ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  select required_quantity - stock_quantity into v_suggested
  from public.cm_material_requirement(p_project_id)
  where material_id = p_material_id;
  v_suggested := greatest(coalesce(v_suggested, 0), 0);

  if v_suggested > 0 and p_requested_quantity > v_suggested * 1.1 and (p_reason is null or trim(p_reason) = '') then
    raise exception 'Jumlah diminta (%) jauh di atas saran (%) -- wajib isi alasan', p_requested_quantity, v_suggested;
  end if;

  insert into public.cm_purchase_requests (project_id, material_id, requested_quantity, suggested_quantity, reason, requested_by)
  values (p_project_id, p_material_id, p_requested_quantity, nullif(v_suggested, 0), nullif(trim(p_reason), ''), v_caller)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cm_decide_purchase_request(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.cm_purchase_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = v_caller, decided_at = now(),
        reject_reason = case when p_approve then null else nullif(trim(p_reason), '') end
    where id = p_id and status = 'pending';
  if not found then
    raise exception 'Purchase request tidak ditemukan atau sudah diputuskan';
  end if;
end;
$$;

-- construction_submit_expense: add p_fulfills_pr_id -- when set, the PR
-- (must be 'approved', same project, same material) is marked 'fulfilled'
-- and linked to the resulting expense row. Explicitly DROP the previous
-- 9-arg overload first -- CREATE OR REPLACE with a different arg count
-- creates a second overload instead of replacing (bit twice already, see
-- 0208's fix).
drop function public.construction_submit_expense(uuid, text, text, numeric, text, date, text, uuid, numeric);

create or replace function public.construction_submit_expense(
  p_project_id uuid,
  p_expense_type text,
  p_party_name text,
  p_amount numeric,
  p_description text default null,
  p_expense_date date default current_date,
  p_photo_url text default null,
  p_material_id uuid default null,
  p_quantity numeric default null,
  p_fulfills_pr_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_project public.construction_projects%rowtype;
  v_id uuid;
  v_payment_method text;
  v_admin record;
  v_is_material boolean;
begin
  if not public.app_has_permission('construction_finance.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_expense_type not in ('gaji_tukang', 'pembelian_material', 'material_tunai', 'pembelian_lain_lain', 'lain_lain_tunai') then
    raise exception 'Jenis pengeluaran tidak valid';
  end if;

  select * into v_project from public.construction_projects where id = p_project_id and status = 'active';
  if not found then
    raise exception 'Proyek tidak ditemukan atau sudah tidak aktif';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;

  if not public.app_has_permission('construction_finance.manage') and v_project.branch_id is distinct from v_caller_branch then
    raise exception 'Proyek ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  if p_party_name is null or trim(p_party_name) = '' then
    raise exception 'Nama %s wajib diisi', case when p_expense_type = 'gaji_tukang' then 'tukang' else 'toko/pihak' end;
  end if;

  v_is_material := p_expense_type in ('pembelian_material', 'material_tunai');
  if p_material_id is not null and not v_is_material then
    raise exception 'Material hanya berlaku untuk jenis pengeluaran Material';
  end if;
  if p_material_id is not null and (p_quantity is null or p_quantity <= 0) then
    raise exception 'Jumlah (quantity) wajib diisi jika memilih material';
  end if;
  if p_fulfills_pr_id is not null and not exists (
    select 1 from public.cm_purchase_requests where id = p_fulfills_pr_id and project_id = p_project_id and material_id = p_material_id and status = 'approved'
  ) then
    raise exception 'Purchase request tidak valid untuk dipenuhi (harus approved, proyek dan material yang sama)';
  end if;

  v_payment_method := case when p_expense_type in ('pembelian_material', 'pembelian_lain_lain') then 'utang' else 'cash' end;

  insert into public.construction_expenses (
    project_id, branch_id, expense_type, party_name, description, amount,
    payment_method, expense_date, photo_url, created_by, material_id, quantity
  )
  values (
    p_project_id, v_project.branch_id, p_expense_type, trim(p_party_name), nullif(trim(p_description), ''), p_amount,
    v_payment_method, coalesce(p_expense_date, current_date), p_photo_url, v_caller, p_material_id, p_quantity
  )
  returning id into v_id;

  if p_material_id is not null and p_quantity is not null and p_quantity > 0 then
    insert into public.cm_stock_movements (project_id, material_id, direction, quantity, source_type, source_expense_id, created_by)
    values (p_project_id, p_material_id, 'in', p_quantity, 'purchase', v_id, v_caller);

    insert into public.cm_material_stock (project_id, material_id, quantity)
    values (p_project_id, p_material_id, p_quantity)
    on conflict (project_id, material_id) do update
      set quantity = cm_material_stock.quantity + excluded.quantity, updated_at = now();
  end if;

  if p_fulfills_pr_id is not null then
    update public.cm_purchase_requests set status = 'fulfilled', fulfilled_expense_id = v_id where id = p_fulfills_pr_id;
  end if;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'construction_expense_submitted',
      case
        when p_expense_type = 'gaji_tukang' then 'Input Gaji Tukang — ' || v_project.name
        when p_expense_type = 'material_tunai' then 'Input Pembelian Material (Tunai) — ' || v_project.name
        when p_expense_type = 'pembelian_material' then 'Input Pembelian Material (Utang) — ' || v_project.name
        when p_expense_type = 'lain_lain_tunai' then 'Input Pembelian Lain-lain (Tunai) — ' || v_project.name
        else 'Input Pembelian Lain-lain (Utang) — ' || v_project.name
      end,
      case
        when p_expense_type = 'gaji_tukang'
          then '👷 Tukang: ' || trim(p_party_name) || E'\n💰 Nominal: Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        when p_expense_type = 'material_tunai'
          then '🧱 Toko/Supplier: ' || trim(p_party_name) || E'\n💰 Nominal (tunai): Rp ' || to_char(p_amount, 'FM999,999,999,999')
            || coalesce(E'\n📦 ' || p_quantity::text, '') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        when p_expense_type = 'pembelian_material'
          then '🏪 Toko: ' || trim(p_party_name) || E'\n💰 Nominal (utang): Rp ' || to_char(p_amount, 'FM999,999,999,999')
            || coalesce(E'\n📦 ' || p_quantity::text, '') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        when p_expense_type = 'lain_lain_tunai'
          then '🧾 Pihak: ' || trim(p_party_name) || E'\n💰 Nominal (tunai): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        else '🧾 Pihak: ' || trim(p_party_name) || E'\n💰 Nominal (utang): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
      end || coalesce(E'\n📝 ' || nullif(trim(p_description), ''), ''),
      '/construction-finance',
      jsonb_build_object('expense_id', v_id, 'project_id', p_project_id, 'expense_type', p_expense_type)
    );
  end loop;

  return v_id;
end;
$$;
