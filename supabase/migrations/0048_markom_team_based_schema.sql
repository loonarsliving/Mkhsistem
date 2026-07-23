-- ============================================================================
-- MK Connect — 0048: Markom becomes TEAM-based, not person-based.
--
-- A "team" is simply every active employee sharing one (branch_id,
-- division_id) -- no new teams table needed, since that's exactly what
-- kpi_tasks.branch_id/division_id already denormalize. A weekly task now
-- belongs to the team as a whole, not to one assignee: any member's work
-- counts toward the team's shared Weekly/Monthly Achievement, and the
-- Branch Manager approves/rejects the task once for the whole team, never
-- per-person. This generalizes cleanly to any future department the same
-- way the original per-employee design did (see 0035).
-- ============================================================================

drop policy kpi_tasks_select on public.kpi_tasks;

drop index if exists public.kpi_tasks_assigned_to_idx;
alter table public.kpi_tasks drop column assigned_to;

create index kpi_tasks_team_period_idx on public.kpi_tasks (branch_id, division_id, period_year, period_month, period_week);

create policy kpi_tasks_select on public.kpi_tasks for select to authenticated
  using (
    deleted_at is null
    and (
      public.app_has_permission('kpi_task.view_all')
      or (public.app_has_permission('kpi_task.view_branch') and branch_id = public.app_current_branch_id())
      or (
        public.app_has_permission('kpi_task.view_own')
        and exists (
          select 1 from public.employees e
          where e.id = auth.uid() and e.branch_id = kpi_tasks.branch_id and e.division_id = kpi_tasks.division_id
        )
      )
    )
  );

-- Guard trigger: no member of the task's own team may ever verify it (even
-- if some future role grants both view_own and verify to the same person) --
-- defense-in-depth mirroring the original per-employee self-verify guard.
create or replace function public.guard_kpi_task_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if exists (
      select 1 from public.employees e
      where e.id = auth.uid() and e.branch_id = old.branch_id and e.division_id = old.division_id
    ) then
      raise exception 'A team member cannot verify their own team''s task' using errcode = '42501';
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
