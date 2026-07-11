-- ============================================================================
-- MK Connect — 0049: Markom KPI transactional RPCs, team-based.
-- ============================================================================

drop function if exists public.kpi_assign_tasks(uuid, smallint, smallint, smallint, jsonb);

-- ----------------------------------------------------------------------------
-- Branch Manager / Director builds a weekly checklist for one TEAM (every
-- active employee at a branch in one division) in one call. p_items is a
-- JSON array of {title, description?, due_date?}. Every active team member
-- is notified once the checklist is created.
-- ----------------------------------------------------------------------------
create or replace function public.kpi_assign_tasks(
  p_branch_id uuid,
  p_period_year smallint,
  p_period_month smallint,
  p_period_week smallint,
  p_items jsonb,
  p_division_id uuid default null
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_division_id uuid := coalesce(p_division_id, (select id from public.divisions where name = 'Marketing & Komunikasi'));
  v_item jsonb;
  v_task_id uuid;
  v_member record;
begin
  if not public.app_has_permission('kpi_task.assign') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if not (public.app_has_permission('kpi_task.view_all') or p_branch_id = public.app_current_branch_id()) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'Branch not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one checklist item is required';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(trim(v_item->>'title'), '') = '' then
      raise exception 'Every checklist item needs a title';
    end if;

    insert into public.kpi_tasks (
      division_id, branch_id, title, description,
      period_year, period_month, period_week, due_date, created_by, updated_by
    ) values (
      v_division_id, p_branch_id,
      v_item->>'title', nullif(v_item->>'description', ''),
      p_period_year, p_period_month, p_period_week,
      nullif(v_item->>'due_date', '')::date,
      v_user_id, v_user_id
    )
    returning id into v_task_id;

    return next v_task_id;
  end loop;

  for v_member in
    select e.id from public.employees e
    where e.branch_id = p_branch_id and e.division_id = v_division_id
      and e.deleted_at is null and e.employment_status = 'active'
  loop
    insert into public.mkc_notifications (user_id, type, title, body, link)
    values (
      v_member.id,
      'kpi_task',
      'Checklist minggu baru untuk tim',
      jsonb_array_length(p_items) || ' task baru untuk Minggu ' || p_period_week || ' ditambahkan ke checklist tim Anda.',
      '/markom'
    );
  end loop;

  return;
end;
$$;

-- ----------------------------------------------------------------------------
-- Branch Manager / Director marks a team task Approved or Needs Revision.
-- Every active team member is notified of the decision (not just one
-- assignee, since the task was never assigned to just one person).
-- ----------------------------------------------------------------------------
create or replace function public.kpi_verify_task(
  p_task_id uuid,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.kpi_tasks%rowtype;
  v_member record;
begin
  if p_status not in ('completed', 'rejected') then
    raise exception 'Invalid status';
  end if;

  if not public.app_has_permission('kpi_task.verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_task from public.kpi_tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found';
  end if;
  if exists (
    select 1 from public.employees e
    where e.id = v_user_id and e.branch_id = v_task.branch_id and e.division_id = v_task.division_id
  ) then
    raise exception 'A team member cannot verify their own team''s task' using errcode = '42501';
  end if;
  if not (public.app_has_permission('kpi_task.view_all') or v_task.branch_id = public.app_current_branch_id()) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_task.status <> 'pending' then
    raise exception 'This task has already been decided';
  end if;

  update public.kpi_tasks set
    status = p_status,
    completed_at = case when p_status = 'completed' then now() else null end,
    verified_by = v_user_id,
    notes = coalesce(p_notes, notes),
    updated_by = v_user_id
  where id = p_task_id;

  for v_member in
    select e.id from public.employees e
    where e.branch_id = v_task.branch_id and e.division_id = v_task.division_id
      and e.deleted_at is null and e.employment_status = 'active'
  loop
    insert into public.mkc_notifications (user_id, type, title, body, link)
    values (
      v_member.id,
      'kpi_task',
      case when p_status = 'completed' then 'Task disetujui: ' || v_task.title else 'Task perlu revisi: ' || v_task.title end,
      coalesce(p_notes, case when p_status = 'completed' then 'Task tim Anda telah disetujui Branch Manager.' else 'Task tim Anda perlu revisi, silakan cek catatan.' end),
      '/markom'
    );
  end loop;
end;
$$;
