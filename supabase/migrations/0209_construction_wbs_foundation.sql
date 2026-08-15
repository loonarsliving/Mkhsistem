-- Phase 1 (Foundation) of the approved Construction Management architecture:
-- WBS (Work Breakdown Structure) templates + per-project WBS instances +
-- weighted progress engine + submit/approve workflow. Reuses
-- construction_finance.submit/.manage as the permission boundary (same
-- audience that already inputs/manages construction_expenses) rather than
-- introducing a new permission namespace yet -- keeps the security surface
-- small until a second city actually onboards.
--
-- cm_units is included but OPTIONAL: Kendari's one live project
-- ("Pembangunan Cabang Kendari") is a single building, not a subdivided
-- housing development, so cm_project_wbs.unit_id is nullable -- WBS can
-- attach directly to a project (single-building case) or to a unit within
-- it (future multi-unit projects like a villa cluster).

create table public.cm_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  code text not null,
  unit_type text,
  construction_budget numeric(14, 2),
  labor_budget numeric(14, 2),
  material_budget numeric(14, 2),
  other_budget numeric(14, 2),
  target_completion date,
  status text not null default 'planning' check (status in ('planning', 'in_progress', 'completed', 'on_hold')),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);

create table public.cm_wbs_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.cm_wbs_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.cm_wbs_templates(id) on delete cascade,
  code text not null,
  name text not null,
  weight numeric(5, 2) not null check (weight > 0 and weight <= 100),
  sort_order int not null default 0
);

create table public.cm_project_wbs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  unit_id uuid references public.cm_units(id) on delete cascade,
  code text not null,
  name text not null,
  weight numeric(5, 2) not null check (weight > 0 and weight <= 100),
  budget numeric(14, 2),
  progress_pct numeric(5, 2) not null default 0 check (progress_pct >= 0 and progress_pct <= 100),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cm_project_wbs_project_idx on public.cm_project_wbs (project_id);
create index cm_project_wbs_unit_idx on public.cm_project_wbs (unit_id);

create table public.cm_wbs_progress_log (
  id uuid primary key default gen_random_uuid(),
  project_wbs_id uuid not null references public.cm_project_wbs(id) on delete cascade,
  progress_pct numeric(5, 2) not null check (progress_pct >= 0 and progress_pct <= 100),
  photo_url text,
  note text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  submitted_by uuid references public.employees(id),
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.employees(id),
  decided_at timestamptz,
  reject_reason text
);
create index cm_wbs_progress_log_wbs_idx on public.cm_wbs_progress_log (project_wbs_id);

alter table public.cm_units enable row level security;
alter table public.cm_wbs_templates enable row level security;
alter table public.cm_wbs_template_items enable row level security;
alter table public.cm_project_wbs enable row level security;
alter table public.cm_wbs_progress_log enable row level security;

create policy cm_units_select on public.cm_units for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_units.project_id and e.id = auth.uid())
);
create policy cm_wbs_templates_select on public.cm_wbs_templates for select to authenticated using (true);
create policy cm_wbs_template_items_select on public.cm_wbs_template_items for select to authenticated using (true);
create policy cm_project_wbs_select on public.cm_project_wbs for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_project_wbs.project_id and e.id = auth.uid())
);
create policy cm_wbs_progress_log_select on public.cm_wbs_progress_log for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (
    select 1 from public.cm_project_wbs w
    join public.construction_projects p on p.id = w.project_id
    join public.employees e on e.branch_id = p.branch_id
    where w.id = cm_wbs_progress_log.project_wbs_id and e.id = auth.uid()
  )
);

-- ----------------------------------------------------------------------------
-- cm_seed_project_wbs(): copies a WBS template onto a project (or a unit
-- within it) in one transaction. Validates the template's weights sum to
-- (approximately) 100 before committing -- the whole insert rolls back
-- automatically if not, since it's one function call.
-- ----------------------------------------------------------------------------
create or replace function public.cm_seed_project_wbs(p_project_id uuid, p_template_id uuid, p_unit_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_branch uuid;
  v_project public.construction_projects%rowtype;
  v_total_weight numeric;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_project from public.construction_projects where id = p_project_id;
  if not found then
    raise exception 'Proyek tidak ditemukan';
  end if;

  select sum(weight) into v_total_weight from public.cm_wbs_template_items where template_id = p_template_id;
  if v_total_weight is null then
    raise exception 'Template WBS kosong atau tidak ditemukan';
  end if;
  if abs(v_total_weight - 100) > 0.5 then
    raise exception 'Total bobot template harus 100%% (saat ini %)', v_total_weight;
  end if;

  if exists (select 1 from public.cm_project_wbs where project_id = p_project_id and unit_id is not distinct from p_unit_id) then
    raise exception 'WBS untuk proyek/unit ini sudah pernah dibuat';
  end if;

  insert into public.cm_project_wbs (project_id, unit_id, code, name, weight, sort_order)
  select p_project_id, p_unit_id, code, name, weight, sort_order
  from public.cm_wbs_template_items
  where template_id = p_template_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_submit_wbs_progress(): site team logs progress against one WBS item.
-- Does NOT touch cm_project_wbs.progress_pct -- that only moves on approval
-- (cm_decide_wbs_progress), so an unapproved submission can never become the
-- basis for procurement or labor payment, per the owner's explicit rule.
-- ----------------------------------------------------------------------------
create or replace function public.cm_submit_wbs_progress(p_project_wbs_id uuid, p_progress_pct numeric, p_photo_url text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_project_branch uuid;
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_progress_pct < 0 or p_progress_pct > 100 then
    raise exception 'Progress harus antara 0-100';
  end if;

  select p.branch_id into v_project_branch
  from public.cm_project_wbs w join public.construction_projects p on p.id = w.project_id
  where w.id = p_project_wbs_id;
  if v_project_branch is null then
    raise exception 'WBS tidak ditemukan';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;
  if not public.app_has_permission('construction_finance.manage') and v_project_branch is distinct from v_caller_branch then
    raise exception 'WBS ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  insert into public.cm_wbs_progress_log (project_wbs_id, progress_pct, photo_url, note, submitted_by)
  values (p_project_wbs_id, p_progress_pct, p_photo_url, nullif(trim(p_note), ''), v_caller)
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_decide_wbs_progress(): approve/reject a submitted progress log. Only an
-- approval ever moves cm_project_wbs.progress_pct forward -- and only
-- forward (cumulative progress can't silently regress without a distinct
-- adjustment workflow, per the owner's data-integrity rule).
-- ----------------------------------------------------------------------------
create or replace function public.cm_decide_wbs_progress(p_log_id uuid, p_approve boolean, p_reject_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_log public.cm_wbs_progress_log%rowtype;
  v_current_progress numeric;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_log from public.cm_wbs_progress_log where id = p_log_id and status = 'submitted';
  if not found then
    raise exception 'Log progress tidak ditemukan atau sudah diputuskan';
  end if;

  if p_approve then
    select progress_pct into v_current_progress from public.cm_project_wbs where id = v_log.project_wbs_id;
    if v_log.progress_pct < v_current_progress then
      raise exception 'Progress baru (%) tidak boleh lebih kecil dari progress saat ini (%) -- gunakan alur adjustment terpisah jika ini disengaja', v_log.progress_pct, v_current_progress;
    end if;

    update public.cm_wbs_progress_log set status = 'approved', decided_by = v_caller, decided_at = now() where id = p_log_id;
    update public.cm_project_wbs
      set progress_pct = v_log.progress_pct,
          status = case when v_log.progress_pct >= 100 then 'completed' when v_log.progress_pct > 0 then 'in_progress' else status end,
          updated_at = now()
      where id = v_log.project_wbs_id;
  else
    update public.cm_wbs_progress_log
      set status = 'rejected', decided_by = v_caller, decided_at = now(), reject_reason = nullif(trim(p_reject_reason), '')
      where id = p_log_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_project_overall_progress(): weighted progress -- SUM(weight * progress) / 100.
-- ----------------------------------------------------------------------------
create or replace function public.cm_project_overall_progress(p_project_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(sum(weight * progress_pct) / nullif(sum(weight), 0), 2), 0)
  from public.cm_project_wbs
  where project_id = p_project_id and unit_id is null;
$$;

insert into public.cm_wbs_templates (name, is_default) values ('Rumah Tinggal (Default)', true);

insert into public.cm_wbs_template_items (template_id, code, name, weight, sort_order)
select t.id, item.code, item.name, item.weight, item.sort_order
from public.cm_wbs_templates t
cross join (values
  ('WBS-01', 'Pre Construction', 3, 1),
  ('WBS-02', 'Earthwork', 4, 2),
  ('WBS-03', 'Foundation', 10, 3),
  ('WBS-04', 'Structure', 20, 4),
  ('WBS-05', 'Wall', 12, 5),
  ('WBS-06', 'Roof', 10, 6),
  ('WBS-07', 'MEP', 10, 7),
  ('WBS-08', 'Flooring', 8, 8),
  ('WBS-09', 'Ceiling', 5, 9),
  ('WBS-10', 'Painting', 6, 10),
  ('WBS-11', 'Door & Window', 5, 11),
  ('WBS-12', 'Sanitary', 3, 12),
  ('WBS-13', 'Furniture', 2, 13),
  ('WBS-14', 'Landscaping', 1, 14),
  ('WBS-15', 'Final Inspection', 1, 15)
) as item(code, name, weight, sort_order)
where t.is_default = true;
