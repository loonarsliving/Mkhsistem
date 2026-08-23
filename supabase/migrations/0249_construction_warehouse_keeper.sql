-- ============================================================================
-- MK Connect — 0249: Petugas Gudang (warehouse keeper) role (punch list
-- item #5 from "Peta Celah Stok Kontraktor").
--
-- The single cheapest, most effective control discussed for this feature:
-- separate "who asks for material" (pengawas/kontraktor, via
-- cm_purchase_requests) from "who is allowed to record material actually
-- leaving the gudang" (cm_consume_material, 0250). No new RBAC permission
-- namespace -- same minimal-surface principle 0209 already established for
-- this module ("reuse construction_finance.submit/.manage rather than
-- introducing a new permission namespace yet"). Segregation of duty comes
-- from the per-project assignment check here, not from a new permission.
-- ============================================================================

create table public.cm_warehouse_keepers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  is_active boolean not null default true,
  assigned_by uuid references public.employees(id),
  assigned_at timestamptz not null default now(),
  deactivated_at timestamptz
);
create index cm_warehouse_keepers_project_idx on public.cm_warehouse_keepers (project_id);
create unique index cm_warehouse_keepers_one_active_per_project on public.cm_warehouse_keepers (project_id) where is_active;

alter table public.cm_warehouse_keepers enable row level security;
create policy cm_warehouse_keepers_select on public.cm_warehouse_keepers for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_warehouse_keepers.project_id and e.id = auth.uid())
);

create or replace function public.cm_assign_warehouse_keeper(p_project_id uuid, p_employee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if not exists (select 1 from public.construction_projects where id = p_project_id) then
    raise exception 'Proyek tidak ditemukan';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and deleted_at is null and employment_status = 'active') then
    raise exception 'Karyawan tidak ditemukan atau tidak aktif';
  end if;

  update public.cm_warehouse_keepers set is_active = false, deactivated_at = now()
  where project_id = p_project_id and is_active;

  insert into public.cm_warehouse_keepers (project_id, employee_id, assigned_by)
  values (p_project_id, p_employee_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- Helper used by cm_consume_material (0250) -- kept as its own stable
-- function so the permission check reads the same wherever it's needed.
create or replace function public.cm_is_warehouse_keeper(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cm_warehouse_keepers
    where project_id = p_project_id and employee_id = auth.uid() and is_active
  );
$$;
