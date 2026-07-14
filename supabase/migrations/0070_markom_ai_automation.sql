-- ============================================================================
-- MK Connect — 0070: Markom AI automation (research-driven checklist,
-- self-complete bug fix, kepala cabang verification notice)
--
-- Two pieces:
--   1. Bug fix: guard_kpi_task_transition (0048) unconditionally blocks any
--      status change made by a member of the task's own team, including the
--      one transition kpi_complete_task (0064) was explicitly built to
--      allow (pending -> completed, self-complete). Every real self-complete
--      call has therefore been raising "A team member cannot verify their
--      own team's task" since 0064 shipped -- the checkbox in
--      TeamChecklistSection has never actually worked. Fixed here by
--      allowing exactly that one transition for a team member, leaving
--      every other guard (verify-only for anything else, no editing a
--      decided task) unchanged.
--   2. markom_run_ai_checklist_dispatch() (pg_cron, every 3 days): enqueues
--      one ai_job_queue job per active Markom team. The job itself (Gemini +
--      Google Search grounding research -> exactly 3 checklist items ->
--      insert into kpi_tasks + notify the team) is processed in
--      app/api/ai/process-job/route.ts, mirroring the crm_sp1_draft job type
--      added in 0069 -- research/generation is the one piece worth a real
--      Gemini call; the dispatch/detection stays plain SQL.
--   3. kpi_complete_task now notifies the team's Kepala Cabang
--      (task_pending_verification, WhatsApp-eligible) when a team member
--      self-completes a task -- it never notified anyone before this.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fix guard_kpi_task_transition to actually allow self-complete.
-- ----------------------------------------------------------------------------
create or replace function public.guard_kpi_task_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_own_team boolean;
begin
  if new.status is distinct from old.status then
    v_is_own_team := exists (
      select 1 from public.employees e
      where e.id = auth.uid() and e.branch_id = old.branch_id and e.division_id = old.division_id
    );

    if v_is_own_team then
      -- The ONE transition a team member may make on their own team's task:
      -- self-complete (kpi_complete_task, 0064), pending -> completed.
      -- Anything else (rejecting, re-opening, acting on a non-pending task)
      -- stays blocked -- only kpi_task.verify holders outside the team can
      -- do those.
      if old.status <> 'pending' or new.status <> 'completed' then
        raise exception 'A team member cannot verify their own team''s task' using errcode = '42501';
      end if;
    else
      if not public.app_has_permission('kpi_task.verify') then
        raise exception 'Insufficient permission' using errcode = '42501';
      end if;
      if old.status <> 'pending' then
        raise exception 'This task has already been decided';
      end if;
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

-- ----------------------------------------------------------------------------
-- 2. New notification category for the AI job type + the self-complete
--    verification notice, both additive.
-- ----------------------------------------------------------------------------
alter table public.mkc_notifications drop constraint mkc_notifications_category_check;
alter table public.mkc_notifications add constraint mkc_notifications_category_check
  check (category is null or category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout', 'leave_approved', 'leave_rejected', 'payroll_available',
    'new_prospect', 'follow_up_reminder', 'new_assignment', 'closing_approved', 'customer_verification', 'target_reminder',
    'markom_new_task', 'task_revision', 'task_approved', 'weekly_reminder',
    'project_progress', 'material_request', 'inspection_reminder',
    'payment_received', 'invoice_due', 'reimbursement_approved',
    'waiting_approval', 'approved', 'rejected',
    'new_announcement', 'new_memo',
    'maintenance', 'version_update', 'emergency_notice',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    -- Markom AI automation (this migration)
    'task_pending_verification'
  ]));

create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout',
    'new_memo',
    'target_reminder',
    'weekly_reminder', 'markom_new_task', 'task_revision',
    'payroll_available',
    'waiting_approval',
    'project_progress', 'material_request', 'inspection_reminder',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification'
  ]) then
    perform net.http_post(
      url := 'https://mkh.haluoleo.id/api/ai/whatsapp-relay',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('notification_id', new.id),
      timeout_milliseconds := 5000
    );
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. kpi_complete_task now tells the team's Kepala Cabang a task is waiting
--    on their verification -- previously silent (see docstring above).
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
    status = 'completed',
    completed_at = now(),
    verified_by = v_user_id,
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
      'Task "' || v_task.title || '" telah ditandai selesai oleh tim. Silakan cek kebenarannya di /markom.',
      '/markom'
    );
  end loop;
end;
$$;

grant execute on function public.kpi_complete_task(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. ai_job_queue gains a third job type.
-- ----------------------------------------------------------------------------
alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in ('whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft'));

-- ----------------------------------------------------------------------------
-- 5. markom_run_ai_checklist_dispatch: every 3 days, one job per active
--    Markom team (branch). No duplicate-guard beyond the cadence itself --
--    unlike CRM's SP1 (one warning per sales/period, deliberately durable),
--    a fresh 3-task checklist every cycle IS the intended behavior here.
-- ----------------------------------------------------------------------------
create or replace function public.markom_run_ai_checklist_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_markom_division_id uuid;
  v_team record;
begin
  select id into v_markom_division_id from public.divisions where name = 'Marketing & Komunikasi';
  if v_markom_division_id is null then
    return;
  end if;

  for v_team in
    select distinct e.branch_id, b.name as branch_name
    from public.employees e
    join public.branches b on b.id = e.branch_id
    where e.division_id = v_markom_division_id and e.deleted_at is null and e.employment_status = 'active'
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('markom_checklist_draft', jsonb_build_object(
      'branch_id', v_team.branch_id,
      'branch_name', v_team.branch_name,
      'division_id', v_markom_division_id
    ));
  end loop;
end;
$$;

-- Day-of-month divisible by 3 is the closest pg_cron gets to "every 3 days"
-- (same approach as 0069) -- 03:00 UTC = 11:00 WITA, after the CRM jobs.
select cron.schedule('markom-ai-checklist-3days', '0 3 */3 * *', $$select public.markom_run_ai_checklist_dispatch();$$);
