-- ============================================================================
-- MK Connect — 0035: Markom KPI schema (generic task/checklist engine)
--
-- Markom is NOT evaluated by revenue or units (unlike Sales) -- it is
-- evaluated by TASK COMPLETION. The Branch Manager assigns a weekly
-- checklist of concrete deliverables (e.g. "5 Instagram Reels") to each
-- Markom employee; only the Branch Manager or a Director can mark an item
-- Completed or Rejected -- the assignee can never self-complete.
--
-- kpi_tasks is deliberately generic (division_id is a plain FK, nothing
-- Markom-specific in the schema) so any future department (HR, Engineering,
-- Procurement, Finance, ...) can reuse the exact same To-Do/KPI engine --
-- assign checklist items to their own division's employees -- without a
-- schema rewrite. "Marketing & Komunikasi" is just the first division wired
-- up to it, the same way "Marketing & Sales" was the first division wired
-- into sales_targets.
--
-- period_year/period_month/period_week: period_week is week-of-month
-- (1-5, Branch-Manager-chosen when building a checklist -- "Week 2" of a
-- given month), so Weekly Progress = filter to one period_week, Monthly
-- Progress = aggregate every period_week within that period_month. due_date
-- is a separate, explicit date (not derived from period_week) so Overdue
-- Tasks has a precise, unambiguous cutoff.
-- ============================================================================

-- Markom doesn't exist as a division yet on the live company org chart --
-- create it the same way every other division already exists (company-wide,
-- branch_id null). HR assigns real employees into it same as any division.
insert into public.divisions (name, code, is_active)
values ('Marketing & Komunikasi', 'MARKOM', true)
on conflict (branch_id, name) do nothing;

create table public.kpi_tasks (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized from assigned_to's division/branch at creation time, same
  -- pattern as prospects.branch_id -- keeps branch/division-scoped RLS and
  -- reporting from needing a join through employees on every row, and keeps
  -- history correct even if the employee is later moved or offboarded.
  division_id uuid not null references public.divisions(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  assigned_to uuid not null references public.employees(id) on delete restrict,
  title text not null,
  description text,
  period_year smallint not null check (period_year between 2020 and 2100),
  period_month smallint not null check (period_month between 1 and 12),
  period_week smallint not null check (period_week between 1 and 5),
  due_date date,
  -- No "submitted"/in-progress state by design -- the assignee cannot move
  -- their own task at all, so every Pending task is, by definition, awaiting
  -- Branch Manager verification.
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  completed_at timestamptz,
  verified_by uuid references public.employees(id),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id),
  updated_by uuid references public.employees(id)
);

create index kpi_tasks_assigned_to_idx on public.kpi_tasks (assigned_to, period_year, period_month, period_week);
create index kpi_tasks_branch_period_idx on public.kpi_tasks (branch_id, period_year, period_month);
create index kpi_tasks_division_idx on public.kpi_tasks (division_id);
create index kpi_tasks_status_idx on public.kpi_tasks (status);
create index kpi_tasks_due_date_idx on public.kpi_tasks (due_date);

create trigger set_updated_at before update on public.kpi_tasks
  for each row execute function public.set_updated_at();

create trigger audit_log after insert or update or delete on public.kpi_tasks
  for each row execute function public.audit_log_trigger();
