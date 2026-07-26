-- ============================================================================
-- MK Connect — 0183: uploading content ticks the checklist and tells the
-- Kepala Cabang
--
-- Bug: createContentSubmissionAction inserts the submission, runs the AI
-- review, and stops. Two things never happened:
--
--   1. The linked kpi_tasks row was never touched. Markom uploaded the video
--      the brief asked for and the checklist item still read 'pending' --
--      which is also why markom-kepala-cabang-pending-reminder (0087/0138)
--      kept nagging about a task that was, in fact, already delivered.
--   2. Nobody was notified. The Kepala Cabang only found the submission by
--      happening to open Content Studio, so review depended on someone
--      remembering to look.
--
-- The plumbing for step 1 already existed and was simply never wired in:
-- kpi_complete_task (0064, hardened by 0137) moves a task from 'pending' to
-- 'awaiting_verification' and notifies the branch head. Content Studio just
-- never called it.
--
-- This does not reuse kpi_complete_task directly, for three reasons: its
-- guard hard-fails when status <> 'pending' (so a re-upload after "needs
-- revision" would raise instead of no-op), its message points at /markom
-- rather than the content itself, and it says nothing about the AI score --
-- which is the specific thing the Kepala Cabang is being asked to check.
--
-- What "tercentang" means here is deliberately 'awaiting_verification', not
-- 'completed'. 0137 exists precisely because self-completing straight to
-- 'completed' let the team bypass the branch head's approval and still count
-- the achievement. Upload is evidence of delivery, not the approval of it.
-- ============================================================================

alter table public.markom_content_submissions
  add column if not exists verifier_notified_at timestamptz;

comment on column public.markom_content_submissions.verifier_notified_at is
  'When the Kepala Cabang was told this submission needs review. Makes markom_content_submitted() idempotent -- retryContentReviewAction re-runs the AI review and must not re-notify.';

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
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead', 'content_published', 'content_publish_reminder',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    'content_publish_failed',
    'database_followup_push',
    'lead_wants_info',
    'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    'disciplinary_warning', 'employee_terminated',
    -- This migration
    'content_review_pending'
  ]));

-- ----------------------------------------------------------------------------
-- guard_kpi_task_transition: fix a contradiction 0137 left behind.
--
-- 0137 introduced 'awaiting_verification' and rewrote kpi_complete_task to
-- land there instead of 'completed' -- but never updated this trigger, whose
-- own-team branch still only permits pending -> 'completed'. The two have
-- disagreed ever since, which means kpi_complete_task has been raising
-- "A team member cannot verify their own team's task" for every Markom member
-- who pressed it. Production confirms it: zero kpi_tasks have ever reached
-- 'awaiting_verification', while 17 sit in 'pending'.
--
-- Corrected rules:
--   * team member  -> may only move pending -> awaiting_verification
--                     (declare delivery, never decide the outcome)
--   * verifier      -> may act from pending or awaiting_verification;
--                     holding kpi_task.verify wins over team membership, so a
--                     branch head who happens to share the team's
--                     branch+division is not locked out of verifying
--   * no JWT        -> trusted server-side path (service role, or this
--                     migration's own backfill). RLS is the real gate for
--                     those; the trigger cannot tell them apart and both are
--                     already server-only.
-- ----------------------------------------------------------------------------
create or replace function public.guard_kpi_task_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_own_team boolean;
  v_can_verify boolean;
begin
  if new.status is distinct from old.status then
    if auth.uid() is null then
      return new;
    end if;

    v_can_verify := public.app_has_permission('kpi_task.verify');
    v_is_own_team := exists (
      select 1 from public.employees e
      where e.id = auth.uid() and e.branch_id = old.branch_id and e.division_id = old.division_id
    );

    if v_is_own_team and not v_can_verify then
      if not (old.status = 'pending' and new.status = 'awaiting_verification') then
        raise exception 'Anggota tim hanya bisa menandai tugas selesai untuk diverifikasi, bukan memutuskan hasilnya'
          using errcode = '42501';
      end if;
    else
      if not v_can_verify then
        raise exception 'Insufficient permission' using errcode = '42501';
      end if;
      if old.status not in ('pending', 'awaiting_verification') then
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
-- markom_content_submitted: called by createContentSubmissionAction once the
-- upload has landed and the AI review has been attempted.
--
-- Runs after the review rather than before it on purpose: the Kepala Cabang
-- is being asked to check the assessment, so the notification carries the
-- score. A failed Gemini call still notifies -- the content exists and needs
-- a human either way, it just says the score is not available yet.
-- ----------------------------------------------------------------------------
create or replace function public.markom_content_submitted(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.markom_content_submissions%rowtype;
  v_task public.kpi_tasks%rowtype;
  v_title text;
  v_media text;
  v_score text;
  v_recipient record;
  v_task_ticked boolean := false;
  v_notified int := 0;
begin
  -- Two legitimate callers with different shapes: a Markom session (via
  -- createContentSubmissionAction) and the KontenAI bridge running on the
  -- service-role client inside /api/ai/process-job, where auth.uid() is null.
  -- Execute is revoked from public/anon below, so "no session" can only mean
  -- the service-role backend -- enforce the permission for a real session and
  -- accept the backend one.
  if auth.uid() is not null and not public.app_has_permission('content_submission.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_sub from public.markom_content_submissions
  where id = p_submission_id and deleted_at is null;
  if not found then
    raise exception 'Submission tidak ditemukan';
  end if;

  -- Idempotent: retryContentReviewAction re-runs the review on an existing
  -- submission and must not produce a second notification.
  if v_sub.verifier_notified_at is not null then
    return jsonb_build_object('notified', 0, 'task_ticked', false, 'skipped', 'already_notified');
  end if;

  -- 1. Tick the checklist item. Only from 'pending': a task already sitting
  -- in awaiting_verification, or already decided, must not be dragged
  -- backwards by a re-upload.
  if v_sub.task_id is not null then
    select * into v_task from public.kpi_tasks where id = v_sub.task_id and deleted_at is null;
    if found then
      v_title := v_task.title;
      if v_task.status = 'pending' then
        update public.kpi_tasks set
          status = 'awaiting_verification',
          completed_at = now(),
          updated_by = coalesce(auth.uid(), v_sub.submitted_by)
        where id = v_sub.task_id;
        v_task_ticked := true;
      end if;
    end if;
  end if;

  if v_title is null then
    select title into v_title from public.loonars_content_items where id = v_sub.beauty_content_item_id;
  end if;
  v_title := coalesce(v_title, 'Konten mandiri (tanpa checklist)');

  -- type is 'kpi_task', not 'markom': mkc_notifications_type_check has a
  -- fixed vocabulary and 'markom' is not in it. This is a checklist-task
  -- verification request, the same type kpi_complete_task uses.
  v_media := case when v_sub.media_type = 'video' then 'Video' else 'Foto' end;
  v_score := case
    when v_sub.ai_score is not null then 'Skor AI ' || trim(to_char(v_sub.ai_score, 'FM999D9')) || '/10.'
    else 'Skor AI belum tersedia.'
  end;

  -- 2. Tell whoever actually verifies for this branch. Kepala Cabang first;
  -- if the branch has none (Jabodetabek and Kendari do not), fall back to
  -- Direktur Operasional + Super Admin the same way 0155 does for ad leads,
  -- so the request never lands nowhere.
  for v_recipient in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.branch_id = v_sub.branch_id
      and em.deleted_at is null and em.employment_status = 'active'
      and r.key = 'kepala_cabang'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_recipient.id, 'kpi_task', 'content_review_pending',
      v_media || ' konten masuk, perlu dinilai',
      v_media || ' untuk "' || v_title || '" sudah diupload tim Markom. ' || v_score
        || ' Mohon dicek dan diberi keputusan di Content Studio.',
      '/markom/content-studio'
    );
    v_notified := v_notified + 1;
  end loop;

  if v_notified = 0 then
    for v_recipient in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.deleted_at is null and em.employment_status = 'active'
        and r.key in ('direktur_operasional', 'super_admin')
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_recipient.id, 'kpi_task', 'content_review_pending',
        v_media || ' konten masuk, perlu dinilai',
        v_media || ' untuk "' || v_title || '" sudah diupload tim Markom. ' || v_score
          || ' Cabang ini belum punya Kepala Cabang, jadi penilaian jatuh ke Anda.',
        '/markom/content-studio'
      );
      v_notified := v_notified + 1;
    end loop;
  end if;

  update public.markom_content_submissions
    set verifier_notified_at = now()
    where id = p_submission_id;

  return jsonb_build_object('notified', v_notified, 'task_ticked', v_task_ticked);
end;
$$;

revoke all on function public.markom_content_submitted(uuid) from public;
grant execute on function public.markom_content_submitted(uuid) to authenticated, service_role;

comment on function public.markom_content_submitted is
  'Called after a Content Studio upload: moves the linked kpi_task to awaiting_verification and notifies the branch verifier with the AI score. Idempotent via verifier_notified_at.';

-- ----------------------------------------------------------------------------
-- Route the new category to WhatsApp. "Pemberitahuan langsung terkirim" only
-- holds if it reaches the verifier's phone -- an in-app bell they are not
-- looking at is the problem this migration exists to fix.
--
-- Restated in full from 0176 with one category added; every other line is
-- unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
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
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    'lead_wants_info',
    'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    -- This migration
    'content_review_pending'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Backfill: submissions already uploaded but never announced. Ticks their
-- checklist item so the pending-reminder cron stops chasing delivered work,
-- and marks them notified without sending a burst of WhatsApp messages about
-- content that is days old.
-- ----------------------------------------------------------------------------
update public.kpi_tasks t
set status = 'awaiting_verification',
    completed_at = coalesce(t.completed_at, s.created_at)
from public.markom_content_submissions s
where s.task_id = t.id
  and s.deleted_at is null
  and t.deleted_at is null
  and t.status = 'pending';

update public.markom_content_submissions
set verifier_notified_at = created_at
where verifier_notified_at is null and deleted_at is null;
