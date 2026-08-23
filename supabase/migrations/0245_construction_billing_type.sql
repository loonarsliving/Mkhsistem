-- ============================================================================
-- MK Connect — 0245: billing_type gate for the cost-by-fee stock-control
-- build (punch list item #1, "Peta Celah Stok Kontraktor").
--
-- Owner's ask: borongan and cost-by-fee projects need different rules --
-- borongan (cm_labor_contracts, paid per Earned Value) never needs stock
-- control; cost-by-fee needs it strict. NULL = unclassified, and every new
-- guard added in the following migrations (0246-0251) only activates when
-- billing_type = 'cost_by_fee'. Kendari's one live project stays NULL here
-- -- deliberately not reclassified by this migration -- so nothing about
-- its daily flow changes today. It can be classified later, explicitly, by
-- whoever owns that call.
--
-- construction_create_project's signature changes (new trailing param), so
-- the old 4-arg overload is dropped first -- CREATE OR REPLACE with a
-- different arg count creates a second overload instead of replacing it
-- (the exact mistake 0208 and 0239 already had to correct).
-- ============================================================================

alter table public.construction_projects
  add column billing_type text check (billing_type in ('borongan', 'cost_by_fee'));

comment on column public.construction_projects.billing_type is
  'NULL = belum diklasifikasi (proyek existing seperti Kendari, perilaku tetap seperti sebelum migrasi ini). cost_by_fee menyalakan guard sisa BOQ (0247), wajib Petugas Gudang untuk stok keluar (0249/0250). borongan tidak pernah melewati guard-guard ini.';

drop function public.construction_create_project(uuid, text, numeric, int);

create or replace function public.construction_create_project(
  p_branch_id uuid,
  p_name text,
  p_budget_per_unit numeric,
  p_total_units int,
  p_billing_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_default_template uuid;
  v_total_budget numeric;
  v_i int;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Nama proyek wajib diisi';
  end if;
  if p_budget_per_unit <= 0 then
    raise exception 'Anggaran per unit harus lebih dari 0';
  end if;
  if p_total_units <= 0 then
    raise exception 'Jumlah unit harus lebih dari 0';
  end if;
  if p_billing_type is not null and p_billing_type not in ('borongan', 'cost_by_fee') then
    raise exception 'Tipe kontrak tidak valid';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'Cabang tidak ditemukan';
  end if;
  if exists (select 1 from public.construction_projects where branch_id = p_branch_id and status = 'active') then
    raise exception 'Cabang ini sudah punya proyek pembangunan yang aktif';
  end if;

  v_total_budget := p_budget_per_unit * p_total_units;

  insert into public.construction_projects (branch_id, name, total_budget, status, billing_type, created_by)
  values (p_branch_id, trim(p_name), v_total_budget, 'active', p_billing_type, auth.uid())
  returning id into v_id;

  for v_i in 1..p_total_units loop
    insert into public.cm_units (project_id, code, construction_budget, status)
    values (v_id, 'U' || lpad(v_i::text, 2, '0'), p_budget_per_unit, 'planning');
  end loop;

  select id into v_default_template from public.cm_wbs_templates where is_default = true limit 1;
  if v_default_template is not null then
    insert into public.cm_project_wbs (project_id, unit_id, code, name, weight, sort_order)
    select v_id, null, code, name, weight, sort_order
    from public.cm_wbs_template_items
    where template_id = v_default_template;
  end if;

  return v_id;
end;
$$;
