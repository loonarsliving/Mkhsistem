-- ============================================================================
-- MK Connect — 0251: periodic physical stock opname (punch list item #7
-- from "Peta Celah Stok Kontraktor").
--
-- The actual control that catches shrinkage/theft, camera or not: someone
-- outside both the gudang and the field counts physical stock and it gets
-- reconciled against the system ledger. Deliberately restricted to
-- construction_finance.manage (Super Admin/Finance) -- not the Petugas
-- Gudang, not the pengawas -- same segregation-of-duty principle as 0249,
-- applied to the count itself.
--
-- Recording an opname does NOT auto-adjust cm_material_stock. A variance
-- is a signal to investigate (per the diagram's "Investigasi Selisih"
-- step), not something to silently overwrite -- the correction, once
-- someone has actually looked into it, goes through the normal
-- consumption/adjustment path like any other stock movement.
-- ============================================================================

create table public.cm_stock_opnames (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  material_id uuid not null references public.cm_materials(id) on delete restrict,
  system_quantity numeric(14, 2) not null,
  counted_quantity numeric(14, 2) not null check (counted_quantity >= 0),
  variance numeric(14, 2) generated always as (counted_quantity - system_quantity) stored,
  note text,
  counted_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index cm_stock_opnames_project_idx on public.cm_stock_opnames (project_id);
create index cm_stock_opnames_material_idx on public.cm_stock_opnames (material_id);

alter table public.cm_stock_opnames enable row level security;
create policy cm_stock_opnames_select on public.cm_stock_opnames for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_stock_opnames.project_id and e.id = auth.uid())
);

create or replace function public.cm_record_stock_opname(p_project_id uuid, p_material_id uuid, p_counted_quantity numeric, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_system_quantity numeric;
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_counted_quantity < 0 then
    raise exception 'Hasil hitung tidak boleh negatif';
  end if;
  if not exists (select 1 from public.construction_projects where id = p_project_id) then
    raise exception 'Proyek tidak ditemukan';
  end if;

  select coalesce(quantity, 0) into v_system_quantity from public.cm_material_stock where project_id = p_project_id and material_id = p_material_id;
  v_system_quantity := coalesce(v_system_quantity, 0);

  insert into public.cm_stock_opnames (project_id, material_id, system_quantity, counted_quantity, note, counted_by)
  values (p_project_id, p_material_id, v_system_quantity, p_counted_quantity, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
