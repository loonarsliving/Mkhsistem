-- ============================================================================
-- MK Connect — 0095: Markom checklist — assignee obstacle response + AI
-- follow-up
--
-- Until now a team member's only interaction with a pending kpi_task was the
-- binary self-complete checkbox (kpi_complete_task, 0064/0070) -- there was
-- no way to explain WHY a task can't be done as briefed (missing material,
-- unrealistic scope, needs something from someone else, ...) other than
-- silently leaving it pending or completing it half-done.
--
-- Two new columns + two new RPCs, mirroring kpi_complete_task's exact
-- team-membership/pending-status guard style:
--   1. kpi_submit_obstacle_response: assignee writes assignee_response,
--      clears any stale ai_guidance from a previous round.
--   2. kpi_apply_ai_response: called right after, in the same server action,
--      once Gemini has decided -- either revises title/description (still
--      allowed on a pending task per guard_kpi_task_transition's existing
--      "only blocks editing a DECIDED task" rule, 0070) or leaves the brief
--      untouched and just records guidance. Notifies the branch's Kepala
--      Cabang (reusing the existing 'task_revision' category, 0070) only
--      when the brief actually changed -- a pure guidance answer doesn't
--      need manager attention.
-- ============================================================================

alter table public.kpi_tasks add column assignee_response text;
alter table public.kpi_tasks add column assignee_response_at timestamptz;
alter table public.kpi_tasks add column ai_guidance text;
alter table public.kpi_tasks add column ai_guidance_at timestamptz;

create or replace function public.kpi_submit_obstacle_response(p_task_id uuid, p_response text)
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

  if length(trim(p_response)) < 3 then
    raise exception 'Response is too short';
  end if;

  update public.kpi_tasks set
    assignee_response = p_response,
    assignee_response_at = now(),
    -- Cleared, not left stale, so the UI never shows an AI answer to a
    -- DIFFERENT obstacle report than the one currently displayed.
    ai_guidance = null,
    ai_guidance_at = null,
    updated_by = v_user_id
  where id = p_task_id;
end;
$$;

grant execute on function public.kpi_submit_obstacle_response(uuid, text) to authenticated;

create or replace function public.kpi_apply_ai_response(
  p_task_id uuid,
  p_action text,
  p_new_title text,
  p_new_description text,
  p_ai_guidance text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.kpi_tasks%rowtype;
  v_manager record;
begin
  if p_action not in ('revise_brief', 'give_guidance') then
    raise exception 'Invalid action';
  end if;

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
    ai_guidance = p_ai_guidance,
    ai_guidance_at = now(),
    title = case when p_action = 'revise_brief' and p_new_title is not null then p_new_title else title end,
    description = case when p_action = 'revise_brief' and p_new_description is not null then p_new_description else description end,
    updated_by = v_user_id
  where id = p_task_id;

  if p_action = 'revise_brief' then
    for v_manager in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.branch_id = v_task.branch_id and em.deleted_at is null and r.key = 'kepala_cabang'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_manager.id, 'kpi_task', 'task_revision', 'AI merevisi brief checklist Markom',
        'AI merevisi brief task "' || coalesce(p_new_title, v_task.title) || '" setelah tim melaporkan kendala. Cek detailnya di /markom.',
        '/markom'
      );
    end loop;
  end if;
end;
$$;

grant execute on function public.kpi_apply_ai_response(uuid, text, text, text, text) to authenticated;
