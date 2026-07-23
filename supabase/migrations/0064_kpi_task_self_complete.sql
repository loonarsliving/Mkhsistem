-- ============================================================================
-- MK Connect — 0064: Markom checklist — let a team member check off their
-- own team's task
--
-- Bug: kpi_verify_task explicitly forbids a team member from acting on
-- their own team's task ("A team member cannot verify their own team's
-- task") -- by design, only someone holding kpi_task.verify (the Branch
-- Manager) could ever move a task out of 'pending'. The member-facing UI
-- (TeamChecklistSection) has always been read-only as a result: there was
-- no RPC a team member could call to mark a task done at all.
--
-- This adds one new, narrowly-scoped RPC alongside the existing one --
-- kpi_verify_task (Branch Manager approve/reject) is completely untouched.
-- kpi_team_stats/kpi_national_stats/kpi_ranking already count
-- `status = 'completed'` generically (verified against their current
-- definitions), so weekly/monthly achievement and Director-level rollups
-- update automatically the moment a task's status flips -- no changes
-- needed there.
-- ============================================================================

create or replace function public.kpi_complete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.kpi_tasks%rowtype;
begin
  if not public.app_has_permission('kpi_task.view_own') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_task from public.kpi_tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found';
  end if;

  if not exists (
    select 1 from public.employees e
    where e.id = v_user_id and e.branch_id = v_task.branch_id and e.division_id = v_task.division_id
      and e.deleted_at is null and e.employment_status = 'active'
  ) then
    raise exception 'You are not a member of this task''s team' using errcode = '42501';
  end if;

  if v_task.status <> 'pending' then
    raise exception 'This task has already been decided';
  end if;

  update public.kpi_tasks set
    status = 'completed',
    completed_at = now(),
    verified_by = v_user_id,
    updated_by = v_user_id
  where id = p_task_id;
end;
$$;

grant execute on function public.kpi_complete_task(uuid) to authenticated;
