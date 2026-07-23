-- ============================================================================
-- MK Connect — 0028: CRM Project Master
-- Extends crm_projects (0022) from a bare name/city reference row into the
-- full Project Master record — the central project reference every future
-- module (Sales, Finance, HR, Project Management, AI Feasibility,
-- Commission, Cashflow) is expected to join against via project_id.
-- Managed directly from MK Connect (Director / Director of Operations, via
-- the existing crm_project.manage permission) — no more manual Supabase
-- edits. RLS/permission from 0023/0027 already cover this table; only the
-- columns are new here.
-- ============================================================================

alter table public.crm_projects
  add column branch_id uuid not null references public.branches(id) on delete restrict,
  add column project_type text not null default 'commercial'
    check (project_type in ('commercial', 'subsidized', 'villa', 'land')),
  -- Business lifecycle stage -- independent of is_active, which is the
  -- archive/activate toggle (a Completed project can still be is_active for
  -- historical reference; an archived project is simply hidden from the
  -- Add Prospect project picker).
  add column status text not null default 'planning'
    check (status in ('planning', 'selling', 'completed')),
  add column start_date date,
  add column target_launch_date date;

create index crm_projects_branch_id_idx on public.crm_projects (branch_id);

-- Projects are branch-scoped; a project name only needs to be unique within
-- its own branch (two branches may each run a project called "Blok A").
drop index public.crm_projects_name_key;
create unique index crm_projects_branch_name_key on public.crm_projects (branch_id, name);
