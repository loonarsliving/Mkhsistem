-- Phase 2 (BOQ) of the approved Construction Management architecture: BOQ
-- (Bill of Quantity) templates + per-project instances. Same pattern as WBS
-- (0209) -- template copied onto a project, then project can adjust
-- quantity/price per line (material prices differ by city). Every BOQ line
-- can optionally link to a WBS item (for the material-requirement-vs-progress
-- engine in a later phase) and/or a cm_materials catalog row (for
-- quantity-based material lines).

create table public.cm_boq_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_type text,
  version text not null default '1.0',
  description text,
  is_active boolean not null default true,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create table public.cm_boq_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.cm_boq_templates(id) on delete cascade,
  category text not null check (category in ('material', 'labor', 'equipment', 'other')),
  material_id uuid references public.cm_materials(id),
  description text not null,
  quantity numeric(14, 2) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  sort_order int not null default 0
);
create index cm_boq_template_items_template_idx on public.cm_boq_template_items (template_id);

create table public.cm_project_boq (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  unit_id uuid references public.cm_units(id) on delete cascade,
  project_wbs_id uuid references public.cm_project_wbs(id),
  category text not null check (category in ('material', 'labor', 'equipment', 'other')),
  material_id uuid references public.cm_materials(id),
  description text not null,
  quantity numeric(14, 2) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  budget numeric(16, 2) generated always as (quantity * unit_price) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cm_project_boq_project_idx on public.cm_project_boq (project_id);
create index cm_project_boq_wbs_idx on public.cm_project_boq (project_wbs_id);

alter table public.cm_boq_templates enable row level security;
alter table public.cm_boq_template_items enable row level security;
alter table public.cm_project_boq enable row level security;

create policy cm_boq_templates_select on public.cm_boq_templates for select to authenticated using (true);
create policy cm_boq_template_items_select on public.cm_boq_template_items for select to authenticated using (true);
create policy cm_project_boq_select on public.cm_project_boq for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_project_boq.project_id and e.id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- cm_seed_project_boq(): copies a BOQ template onto a project (or unit), same
-- one-transaction pattern as cm_seed_project_wbs.
-- ----------------------------------------------------------------------------
create or replace function public.cm_seed_project_boq(p_project_id uuid, p_template_id uuid, p_unit_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if not exists (select 1 from public.construction_projects where id = p_project_id) then
    raise exception 'Proyek tidak ditemukan';
  end if;
  if not exists (select 1 from public.cm_boq_template_items where template_id = p_template_id) then
    raise exception 'Template BOQ kosong atau tidak ditemukan';
  end if;
  if exists (select 1 from public.cm_project_boq where project_id = p_project_id and unit_id is not distinct from p_unit_id) then
    raise exception 'BOQ untuk proyek/unit ini sudah pernah dibuat';
  end if;

  insert into public.cm_project_boq (project_id, unit_id, category, material_id, description, quantity, unit, unit_price, sort_order)
  select p_project_id, p_unit_id, category, material_id, description, quantity, unit, unit_price, sort_order
  from public.cm_boq_template_items
  where template_id = p_template_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_adjust_boq_line(): project-level quantity/price adjustment (material
-- prices differ by city -- see the approved architecture's Yogyakarta vs
-- Kendari semen example).
-- ----------------------------------------------------------------------------
create or replace function public.cm_adjust_boq_line(p_line_id uuid, p_quantity numeric, p_unit_price numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_quantity <= 0 or p_unit_price < 0 then
    raise exception 'Quantity dan harga harus valid';
  end if;

  update public.cm_project_boq set quantity = p_quantity, unit_price = p_unit_price, updated_at = now() where id = p_line_id;
  if not found then
    raise exception 'Baris BOQ tidak ditemukan';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_boq_summary(): budget rollup by category -- material + labor +
-- equipment + other = total construction budget, per the approved formula.
-- ----------------------------------------------------------------------------
create or replace function public.cm_boq_summary(p_project_id uuid)
returns table(category text, total_budget numeric)
language sql
stable
security definer
set search_path = public
as $$
  select category, coalesce(sum(budget), 0) as total_budget
  from public.cm_project_boq
  where project_id = p_project_id and unit_id is null
  group by category;
$$;

insert into public.cm_boq_templates (name, unit_type, version, description) values
  ('Rumah Tinggal Standar', 'Rumah Tinggal', '1.0', 'Template BOQ default -- material dasar rumah tinggal, disesuaikan per proyek/kota.');

insert into public.cm_boq_template_items (template_id, category, material_id, description, quantity, unit, unit_price, sort_order)
select t.id, 'material', m.id, m.name, v.qty, m.unit_satuan, m.standard_price, v.sort_order
from public.cm_boq_templates t
cross join (values
  ('SMN-01', 80, 1),
  ('BSI-01', 1200, 2),
  ('PSR-01', 15, 3),
  ('BTU-01', 10, 4),
  ('BTR-01', 25, 5),
  ('CAT-01', 40, 6),
  ('KRM-01', 60, 7),
  ('PVC-01', 20, 8),
  ('KBL-01', 150, 9),
  ('KYU-01', 30, 10)
) as v(material_code, qty, sort_order)
join public.cm_materials m on m.code = v.material_code
where t.version = '1.0' and t.name = 'Rumah Tinggal Standar';
