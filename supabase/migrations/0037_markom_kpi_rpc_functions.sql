-- ============================================================================
-- MK Connect — 0037: Markom KPI transactional RPC functions
-- Same SECURITY DEFINER + own-permission-check pattern as 0007/0024.
-- ============================================================================

alter table public.mkc_notifications drop constraint mkc_notifications_type_check;
alter table public.mkc_notifications add constraint mkc_notifications_type_check
  check (type = any (array['memo', 'announcement', 'attendance', 'leave_request', 'system', 'registration', 'crm', 'kpi_task']));

-- ----------------------------------------------------------------------------
-- Branch Manager / Director builds a weekly checklist for one employee in
-- one call -- p_items is a JSON array of {title, description?, due_date?},
-- matching the "Week 2 / Alya / 5 checklist items" shape directly. division_id
-- and branch_id are captured from the assignee's own employee row so the
-- task carries correct history even if they're later moved between branches.
-- ----------------------------------------------------------------------------
create or replace function public.kpi_assign_tasks(
  p_assigned_to uuid,
  p_period_year smallint,
  p_period_month smallint,
  p_period_week smallint,
  p_items jsonb
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_division_id uuid;
  v_branch_id uuid;
  v_item jsonb;
  v_task_id uuid;
begin
  if not public.app_has_permission('kpi_task.assign') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select division_id, branch_id into v_division_id, v_branch_id
  from public.employees where id = p_assigned_to and deleted_at is null;

  if v_branch_id is null then
    raise exception 'Employee not found';
  end if;

  if not (public.app_has_permission('kpi_task.view_all') or v_branch_id = public.app_current_branch_id()) then
    raise exception 'Insufficient permission' using errcode = '42501';
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
      division_id, branch_id, assigned_to, title, description,
      period_year, period_month, period_week, due_date, created_by, updated_by
    ) values (
      v_division_id, v_branch_id, p_assigned_to,
      v_item->>'title', nullif(v_item->>'description', ''),
      p_period_year, p_period_month, p_period_week,
      nullif(v_item->>'due_date', '')::date,
      v_user_id, v_user_id
    )
    returning id into v_task_id;

    return next v_task_id;
  end loop;

  insert into public.mkc_notifications (user_id, type, title, body, link)
  values (
    p_assigned_to,
    'kpi_task',
    'Checklist minggu baru ditugaskan',
    jsonb_array_length(p_items) || ' task baru untuk Minggu ' || p_period_week || ' ditambahkan ke checklist Anda.',
    '/markom'
  );

  return;
end;
$$;

-- ----------------------------------------------------------------------------
-- Edit a still-pending task's content (title/description/due_date). Blocked
-- on an already-decided task by guard_kpi_task_transition (0036) even if
-- called directly against the table, but checked here too for a clean error.
-- ----------------------------------------------------------------------------
create or replace function public.kpi_update_task(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_due_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.kpi_tasks%rowtype;
begin
  if not public.app_has_permission('kpi_task.assign') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_task from public.kpi_tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found';
  end if;
  if not (public.app_has_permission('kpi_task.view_all') or v_task.branch_id = public.app_current_branch_id()) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_task.status <> 'pending' then
    raise exception 'Cannot edit a task that has already been decided';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Title is required';
  end if;

  update public.kpi_tasks set
    title = p_title, description = p_description, due_date = p_due_date, updated_by = v_user_id
  where id = p_task_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Soft-delete a mistakenly created task. Only for still-pending tasks --
-- a decided task is history and must stay visible in Achievement/Ranking.
-- ----------------------------------------------------------------------------
create or replace function public.kpi_delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.kpi_tasks%rowtype;
begin
  if not public.app_has_permission('kpi_task.assign') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_task from public.kpi_tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found';
  end if;
  if not (public.app_has_permission('kpi_task.view_all') or v_task.branch_id = public.app_current_branch_id()) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_task.status <> 'pending' then
    raise exception 'Cannot delete a task that has already been decided';
  end if;

  update public.kpi_tasks set deleted_at = now(), updated_by = v_user_id where id = p_task_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Branch Manager / Director marks a task Completed or Rejected. This is the
-- ONLY path that changes status -- the assignee can never call this on their
-- own task ("Markom employees CANNOT mark their own task as completed").
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
  if v_task.assigned_to = v_user_id then
    raise exception 'The assignee cannot verify their own task' using errcode = '42501';
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

  insert into public.mkc_notifications (user_id, type, title, body, link)
  values (
    v_task.assigned_to,
    'kpi_task',
    case when p_status = 'completed' then 'Task selesai: ' || v_task.title else 'Task ditolak: ' || v_task.title end,
    coalesce(p_notes, case when p_status = 'completed' then 'Task Anda telah diverifikasi selesai.' else 'Task Anda ditolak, silakan cek catatan.' end),
    '/markom'
  );
end;
$$;
