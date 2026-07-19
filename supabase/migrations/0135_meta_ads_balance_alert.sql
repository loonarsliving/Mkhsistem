-- ============================================================================
-- MK Connect — 0135: Meta Ads balance alert to Super Admin
--
-- Alerts every active Super Admin (once per low-balance episode, not every
-- check) when the Meta Ads account's prepaid balance drops below Rp 100.000.
-- Meta's Graph API is the only source of truth for this number (see
-- lib/meta/ads.ts's getAdAccountBalanceInfo) -- it can't be read from SQL
-- directly, so a Vercel route does the real check and this migration just
-- wires up: a tiny singleton state table to remember whether we're already
-- mid-episode (so a still-low balance doesn't re-alert every run), the
-- notification category, and the cron schedule that calls the route.
-- ============================================================================

create table public.meta_ads_balance_state (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  last_balance_idr numeric,
  alert_active boolean not null default false,
  checked_at timestamptz,
  constraint meta_ads_balance_state_singleton check (id = '00000000-0000-0000-0000-000000000001'::uuid)
);
insert into public.meta_ads_balance_state (id) values ('00000000-0000-0000-0000-000000000001'::uuid);

alter table public.meta_ads_balance_state enable row level security;
comment on table public.meta_ads_balance_state is
  'Singleton row tracking the last checked Meta Ads balance and whether a low-balance alert episode is active, so the hourly check only alerts Super Admin once per episode instead of every run. Written only by the admin client from app/api/markom/check-ads-balance/route.ts -- no client-facing policies needed.';

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
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    -- This migration
    'meta_ads_balance_low'
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
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    -- This migration
    'meta_ads_balance_low'
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

-- Every 6 hours -- ad spend doesn't move fast enough to need hourly checks,
-- and this avoids hammering the Graph API for a number that rarely changes.
select cron.schedule(
  'meta-ads-balance-check',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://mkh.haluoleo.id/api/markom/check-ads-balance',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
