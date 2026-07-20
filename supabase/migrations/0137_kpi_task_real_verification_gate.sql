-- ============================================================================
-- MK Connect — 0131: Markom checklist self-complete no longer bypasses
-- Kepala Cabang approval
--
-- Bug: kpi_complete_task (0064/0070) let a team member flip a task straight
-- from 'pending' to the FINAL 'completed' status -- already counted in
-- kpi_team_stats/kpi_national_stats/kpi_ranking achievement, and
-- verified_by was set to the team member themselves, not a real verifier.
-- The Kepala Cabang notification ("perlu diverifikasi") was purely
-- informational: TaskReviewBoard's "Tasks Waiting Review" list only ever
-- queried status = 'pending' (features/markom/components/task-review-
-- board.tsx), so a self-completed task never showed up there, and
-- kpi_verify_task's own guard (`status <> 'pending'`) would reject any
-- attempt to act on it anyway. Net effect: self-completing a task WAS the
-- approval, contradicting 0035's original design ("only the Branch Manager
-- or a Director can mark an item Completed or Rejected -- the assignee can
-- never self-complete") that 0064 was supposed to only supplement, not
-- silently replace.
--
-- Fix: a new intermediate status, 'awaiting_verification'. Self-completing
-- now lands there, NOT on 'completed' -- it only counts as truly done, and
-- only shows up as a Branch Manager achievement, once kpi_verify_task
-- (Approve/Needs Revision) actually acts on it. kpi_verify_task's guard
-- widens to accept both 'pending' (a Branch Manager can still decide
-- directly, unchanged) and 'awaiting_verification' (the new, real review
-- step). TaskReviewBoard is updated (separate commit, same change) to list
-- 'awaiting_verification' instead of 'pending' -- that is what "waiting for
-- YOUR review" actually means now.
-- ============================================================================

alter table public.kpi_tasks drop constraint kpi_tasks_status_check;
alter table public.kpi_tasks add constraint kpi_tasks_status_check
  check (status = any (array['pending', 'awaiting_verification', 'completed', 'rejected']));

comment on column public.kpi_tasks.status is
  'pending: not yet touched. awaiting_verification: team self-marked done (kpi_complete_task), waiting on Kepala Cabang''s Approve/Needs Revision decision -- NOT yet counted as achievement. completed/rejected: final, decided by kpi_verify_task.';

-- ----------------------------------------------------------------------------
-- kpi_complete_task: lands on 'awaiting_verification', not the final
-- 'completed'. verified_by is left null -- it means "who verified this",
-- and the team member self-completing is not a verifier.
-- ----------------------------------------------------------------------------
create or replace function public.kpi_complete_task(p_task_id uuid)
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
    status = 'awaiting_verification',
    completed_at = now(),
    updated_by = v_user_id
  where id = p_task_id;

  for v_manager in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.branch_id = v_task.branch_id and em.deleted_at is null and r.key = 'kepala_cabang'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_manager.id, 'kpi_task', 'task_pending_verification', 'Task Markom selesai, perlu diverifikasi',
      'Task "' || v_task.title || '" telah ditandai selesai oleh tim, menunggu persetujuan Anda. Silakan cek di /markom.',
      '/markom'
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- kpi_verify_task: guard widens to accept 'pending' (Branch Manager decides
-- directly, unchanged) OR 'awaiting_verification' (confirming/rejecting a
-- self-completed task -- the actual bug fix).
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
  if v_task.status not in ('pending', 'awaiting_verification') then
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
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_member.id,
      'kpi_task',
      case when p_status = 'completed' then 'task_approved' else 'task_revision' end,
      case when p_status = 'completed' then 'Task disetujui: ' || v_task.title else 'Task perlu revisi: ' || v_task.title end,
      coalesce(p_notes, case when p_status = 'completed' then 'Task tim Anda telah disetujui Branch Manager.' else 'Task tim Anda perlu revisi, silakan cek catatan.' end),
      '/markom'
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- kpi_team_stats: waiting_review_count now genuinely means "awaiting your
-- (Kepala Cabang) review" (status = 'awaiting_verification'), not "team
-- still has open pending tasks" (that number is already weekly/
-- monthly_remaining). Not rendered by any UI yet, safe to redefine.
-- ----------------------------------------------------------------------------
create or replace function public.kpi_team_stats(
  p_branch_id uuid default null,
  p_month smallint default null,
  p_year smallint default null,
  p_division_id uuid default null
)
returns table (
  branch_id uuid,
  branch_name text,
  division_id uuid,
  period_month smallint,
  period_year smallint,
  current_week smallint,
  team_members jsonb,
  weekly_total bigint,
  weekly_completed bigint,
  weekly_remaining bigint,
  weekly_achievement_percent numeric,
  monthly_total bigint,
  monthly_completed bigint,
  monthly_remaining bigint,
  monthly_achievement_percent numeric,
  overdue_count bigint,
  waiting_review_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_division_id uuid := coalesce(p_division_id, (select id from public.divisions where name = 'Marketing & Komunikasi'));
  v_branch_id uuid;
  v_branch_name text;
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_current_week smallint := least(ceil(extract(day from current_date)::numeric / 7)::smallint, 5);
  v_team_members jsonb;
  v_weekly_total bigint;
  v_weekly_completed bigint;
  v_monthly_total bigint;
  v_monthly_completed bigint;
  v_overdue bigint;
  v_waiting bigint;
begin
  if p_branch_id is not null then
    v_branch_id := p_branch_id;
  else
    select e.branch_id into v_branch_id from public.employees e where e.id = v_caller;
  end if;

  if v_branch_id is null then
    raise exception 'Branch not found';
  end if;

  if not (
    public.app_has_permission('kpi_task.view_all')
    or (public.app_has_permission('kpi_task.view_branch') and v_branch_id = public.app_current_branch_id())
    or (
      public.app_has_permission('kpi_task.view_own')
      and exists (select 1 from public.employees e where e.id = v_caller and e.branch_id = v_branch_id and e.division_id = v_division_id)
    )
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select b.name into v_branch_name from public.branches b where b.id = v_branch_id;

  select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id, 'full_name', e.full_name) order by e.full_name), '[]'::jsonb)
    into v_team_members
    from public.employees e
    where e.branch_id = v_branch_id and e.division_id = v_division_id
      and e.deleted_at is null and e.employment_status = 'active';

  select count(*), count(*) filter (where t.status = 'completed')
    into v_weekly_total, v_weekly_completed
    from public.kpi_tasks t
    where t.branch_id = v_branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.period_year = v_year and t.period_month = v_month and t.period_week = v_current_week;

  select count(*), count(*) filter (where t.status = 'completed')
    into v_monthly_total, v_monthly_completed
    from public.kpi_tasks t
    where t.branch_id = v_branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.period_year = v_year and t.period_month = v_month;

  select count(*) into v_overdue from public.kpi_tasks t
    where t.branch_id = v_branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.status = 'pending' and t.due_date is not null and t.due_date < current_date;

  select count(*) into v_waiting from public.kpi_tasks t
    where t.branch_id = v_branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.status = 'awaiting_verification';

  return query select
    v_branch_id, v_branch_name, v_division_id, v_month, v_year, v_current_week,
    v_team_members,
    v_weekly_total, v_weekly_completed, v_weekly_total - v_weekly_completed,
    case when v_weekly_total = 0 then 0 else round(v_weekly_completed::numeric / v_weekly_total * 100, 1) end,
    v_monthly_total, v_monthly_completed, v_monthly_total - v_monthly_completed,
    case when v_monthly_total = 0 then 0 else round(v_monthly_completed::numeric / v_monthly_total * 100, 1) end,
    v_overdue, v_waiting;
end;
$$;

-- ----------------------------------------------------------------------------
-- markom_notify_kepala_cabang_pending: "has the team made progress in the
-- last 3 days" must also count self-completed tasks awaiting the Kepala
-- Cabang's OWN review -- otherwise this escalation would now wrongly claim
-- "zero progress" for a team that already finished work sitting in the
-- manager's own queue.
-- ----------------------------------------------------------------------------
create or replace function public.markom_notify_kepala_cabang_pending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_notified integer;
  v_branch record;
begin
  for v_branch in
    select cnt.branch_id, cnt.pending_count,
      exists (
        select 1 from public.kpi_tasks kt2
        where kt2.branch_id = cnt.branch_id and kt2.status in ('completed', 'awaiting_verification') and kt2.completed_at >= now() - interval '3 days'
      ) as has_recent_progress
    from (
      select branch_id, count(*) as pending_count, min(created_at) as oldest_pending_at
      from public.kpi_tasks
      where status = 'pending' and deleted_at is null
      group by branch_id
      having min(created_at) <= now() - interval '1 day'
    ) cnt
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    select em.id, 'kpi_task', 'weekly_reminder',
      case when v_branch.has_recent_progress then 'Task Markom belum selesai' else 'Tim Markom butuh teguran langsung' end,
      case
        when v_branch.has_recent_progress then
          'Tim Markom cabang Anda masih punya ' || v_branch.pending_count || ' task yang belum diselesaikan.'
        else
          'Tim Markom cabang Anda memiliki ' || v_branch.pending_count || ' task yang BELUM ADA PROGRES sama sekali dalam 3 hari terakhir. Mohon tegur langsung tim Markom Anda dan pastikan mereka segera mengerjakan checklist yang sudah dibuatkan AI.'
      end,
      '/markom'
    from public.employees em
    join public.roles r on r.id = em.role_id
    where em.branch_id = v_branch.branch_id and r.key = 'kepala_cabang' and em.deleted_at is null and em.employment_status = 'active';
    get diagnostics v_notified = row_count;
    v_total := v_total + v_notified;

    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    select em.id, 'kpi_task', 'weekly_reminder', 'Checklist konten belum selesai',
      'Anda masih punya ' || v_branch.pending_count || ' checklist konten yang belum dikerjakan. Segera selesaikan.',
      '/markom'
    from public.employees em
    join public.divisions d on d.id = em.division_id
    where em.branch_id = v_branch.branch_id and d.name = 'Marketing & Komunikasi' and em.deleted_at is null and em.employment_status = 'active';
    get diagnostics v_notified = row_count;
    v_total := v_total + v_notified;
  end loop;
  return v_total;
end;
$$;
