-- ============================================================================
-- MK Connect — 0106: WhatsApp inbound webhook silence monitor
--
-- The incident this fixes: Whacenter stopped forwarding inbound messages
-- for 3 days (linked-device disconnect + a webhook URL typo on their side)
-- and nobody noticed until a specific ad lead was reported missing. This
-- checks hourly whether a real inbound WhatsApp event (payload.source =
-- 'WHACENTER', i.e. an actual parsed message -- not just any HTTP hit like
-- a verification ping) has landed in the last 4 hours. If not, alerts every
-- active Super Admin once per silence episode (won't re-alert every hour
-- while still broken).
--
-- 4 hours is a starting threshold, not a hard policy -- tune later if it
-- turns out too sensitive/insensitive for real traffic patterns.
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
    'daily_motivation', 'daily_report', 'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead',
    'content_published', 'content_publish_reminder',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    -- This migration
    'whatsapp_webhook_silence_alert'
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
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    -- This migration
    'whatsapp_webhook_silence_alert'
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

create or replace function public.check_whatsapp_webhook_health()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_incoming timestamptz;
  v_hours_silent numeric;
  v_admin record;
begin
  select max(created_at) into v_last_incoming
  from public.ai_integration_logs
  where connector = 'whatsapp' and direction = 'incoming' and status = 'success' and payload ->> 'source' = 'WHACENTER';

  v_hours_silent := extract(epoch from (now() - coalesce(v_last_incoming, now() - interval '999 hours'))) / 3600;

  if v_hours_silent < 4 then
    return;
  end if;

  -- Already alerted for this ongoing silence episode -- don't re-alert
  -- every hour while it's still broken.
  if exists (
    select 1 from public.mkc_notifications
    where category = 'whatsapp_webhook_silence_alert' and created_at >= coalesce(v_last_incoming, now() - interval '999 hours')
  ) then
    return;
  end if;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_admin.id, 'system', 'whatsapp_webhook_silence_alert',
      'Peringatan: WhatsApp masuk berhenti',
      'Tidak ada pesan WhatsApp masuk yang tercatat sejak '
        || coalesce(to_char(v_last_incoming, 'DD Mon HH24:MI'), 'lama sekali')
        || ' (' || round(v_hours_silent) || ' jam). Kemungkinan webhook Whacenter terputus lagi -- mohon dicek dashboard Whacenter (koneksi device & URL webhook).',
      '/monitoring'
    );
  end loop;
end;
$$;

comment on function public.check_whatsapp_webhook_health is
  'Hourly: alerts every Super Admin once per silence episode if no real inbound WhatsApp event has landed in 4+ hours -- catches a Whacenter webhook/device disconnect within hours instead of days.';

select cron.schedule('whatsapp-webhook-health-hourly', '0 * * * *', $$select public.check_whatsapp_webhook_health();$$);
