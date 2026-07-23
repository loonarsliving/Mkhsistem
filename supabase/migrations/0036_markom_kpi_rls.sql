-- ============================================================================
-- MK Connect — 0036: Markom KPI row level security
-- Same app_has_permission() / app_current_branch_id() helpers as every other
-- feature (0006). Direct table writes are defense-in-depth only -- the app
-- always goes through the RPCs in 0037 for the same reason prospects does
-- (atomic validation, e.g. "no self-verification" and "no editing a
-- decided task"), enforced here again via a guard trigger so it holds even
-- against a direct table write.
-- ============================================================================

alter table public.kpi_tasks enable row level security;

create policy kpi_tasks_select on public.kpi_tasks for select to authenticated
  using (
    deleted_at is null
    and (
      (assigned_to = auth.uid() and public.app_has_permission('kpi_task.view_own'))
      or public.app_has_permission('kpi_task.view_all')
      or (public.app_has_permission('kpi_task.view_branch') and branch_id = public.app_current_branch_id())
    )
  );

create policy kpi_tasks_insert on public.kpi_tasks for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.app_has_permission('kpi_task.assign')
    and (public.app_has_permission('kpi_task.view_all') or branch_id = public.app_current_branch_id())
  );

create policy kpi_tasks_update on public.kpi_tasks for update to authenticated
  using (
    public.app_has_permission('kpi_task.assign')
    or public.app_has_permission('kpi_task.verify')
  )
  with check (
    public.app_has_permission('kpi_task.assign')
    or public.app_has_permission('kpi_task.verify')
  );

-- Row-level RLS can't restrict which *columns* change or by whom relative to
-- the row's own assigned_to -- so "the assignee can never self-verify" and
-- "a decided task's checklist content is locked" both need a trigger.
create or replace function public.guard_kpi_task_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.assigned_to = auth.uid() then
      raise exception 'The assignee cannot verify their own task' using errcode = '42501';
    end if;
    if not public.app_has_permission('kpi_task.verify') then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
    if old.status <> 'pending' then
      raise exception 'This task has already been decided';
    end if;
  end if;

  if old.status <> 'pending' and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Cannot edit a task that has already been decided';
  end if;

  return new;
end;
$$;

create trigger guard_kpi_task_transition
  before update on public.kpi_tasks
  for each row execute function public.guard_kpi_task_transition();
