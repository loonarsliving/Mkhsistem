-- ============================================================================
-- MK Connect — 0250: stock consumption (stok keluar) with photo evidence
-- (punch list item #6 from "Peta Celah Stok Kontraktor").
--
-- The gap confirmed while mapping this module: the only writer of
-- cm_stock_movements is construction_submit_expense, and it only ever
-- writes direction='in' (0212). 'out'/consumption existed solely in the
-- CHECK constraint (0207) -- stock accumulated, never decreased. This adds
-- the actual write path, gated to whoever is that project's assigned
-- Petugas Gudang (0249) or has construction_finance.manage -- the
-- segregation-of-duty control is enforced here, not just documented.
-- ============================================================================

create table public.cm_material_consumption (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  material_id uuid not null references public.cm_materials(id) on delete restrict,
  quantity numeric(14, 2) not null check (quantity > 0),
  project_wbs_id uuid references public.cm_project_wbs(id),
  photo_url text not null,
  note text,
  recorded_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index cm_material_consumption_project_idx on public.cm_material_consumption (project_id);
create index cm_material_consumption_material_idx on public.cm_material_consumption (material_id);

alter table public.cm_stock_movements
  add column source_consumption_id uuid references public.cm_material_consumption(id) on delete set null;

alter table public.cm_material_consumption enable row level security;
create policy cm_material_consumption_select on public.cm_material_consumption for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_material_consumption.project_id and e.id = auth.uid())
);

create or replace function public.cm_consume_material(
  p_project_id uuid,
  p_material_id uuid,
  p_quantity numeric,
  p_photo_url text,
  p_project_wbs_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_current_stock numeric;
  v_id uuid;
begin
  if not (public.app_has_permission('construction_finance.manage') or public.cm_is_warehouse_keeper(p_project_id)) then
    raise exception 'Hanya Petugas Gudang proyek ini yang boleh mencatat barang keluar' using errcode = '42501';
  end if;
  if p_quantity <= 0 then
    raise exception 'Jumlah harus lebih dari 0';
  end if;
  if p_photo_url is null or trim(p_photo_url) = '' then
    raise exception 'Foto bukti serah terima wajib diisi';
  end if;
  if not exists (select 1 from public.construction_projects where id = p_project_id) then
    raise exception 'Proyek tidak ditemukan';
  end if;

  select quantity into v_current_stock from public.cm_material_stock where project_id = p_project_id and material_id = p_material_id;
  v_current_stock := coalesce(v_current_stock, 0);
  if p_quantity > v_current_stock then
    raise exception 'Stok tidak cukup (tersedia %, diminta %)', v_current_stock, p_quantity;
  end if;

  insert into public.cm_material_consumption (project_id, material_id, quantity, project_wbs_id, photo_url, note, recorded_by)
  values (p_project_id, p_material_id, p_quantity, p_project_wbs_id, trim(p_photo_url), nullif(trim(p_note), ''), v_caller)
  returning id into v_id;

  insert into public.cm_stock_movements (project_id, material_id, direction, quantity, source_type, source_consumption_id, note, created_by)
  values (p_project_id, p_material_id, 'out', p_quantity, 'consumption', v_id, p_note, v_caller);

  update public.cm_material_stock
  set quantity = quantity - p_quantity, updated_at = now()
  where project_id = p_project_id and material_id = p_material_id;

  return v_id;
end;
$$;
