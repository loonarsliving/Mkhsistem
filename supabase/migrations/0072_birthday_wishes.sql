-- ============================================================================
-- MK Connect — 0072: Automatic birthday wishes
--
-- Pure SQL, zero Gemini calls (per the "AI only for real research/generation"
-- rule established this session) -- a birthday match against birth_date is a
-- deterministic date comparison, not something generation adds value to.
-- Runs every day (including weekends, unlike the Mon-Fri daily motivation
-- job) since birthdays don't skip weekends.
-- ============================================================================

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
    -- Birthday wishes (this migration)
    'birthday_wish'
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
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish'
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

create or replace function public.ai_send_birthday_wishes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select e.id, 'system', 'birthday_wish', 'Selamat Ulang Tahun!',
    'Selamat ulang tahun, ' || e.full_name || '! Semoga sehat selalu, makin sukses, dan makin semangat berkarya bersama PT Maha Karya Haluoleo.',
    '/profile'
  from public.employees e
  where e.deleted_at is null and e.employment_status = 'active'
    and e.birth_date is not null
    and extract(month from e.birth_date) = extract(month from current_date)
    and extract(day from e.birth_date) = extract(day from current_date);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 23:00 UTC = 07:00 WITA, every day (birthdays don't skip weekends, unlike
-- ai-daily-motivation which is Mon-Fri only).
select cron.schedule(
  'ai-birthday-wishes-daily',
  '0 23 * * *',
  $$select public.ai_send_birthday_wishes();$$
);
