-- ============================================================================
-- MK Connect — 0156: 2x-daily database follow-up push for Villa (Loonars
-- Living) + Cariu (Griya Cariu Indah) Sales
--
-- Owner's call: Meta ads were just paused for these two projects
-- specifically, so Sales should stop waiting on fresh ad leads and instead
-- work through the existing prospect database one by one. Existing
-- reminders (crm_run_follow_up_reminders, 7-day per-prospect;
-- crm_run_prospect_analysis, 3-day "stuck" digest) already exist but at a
-- much lower cadence and company-wide, not specific to this decision --
-- this adds a focused, higher-frequency (2x/day) nudge scoped to only these
-- two projects' assigned Sales, on top of (not replacing) those.
--
-- crm_run_sales_coaching (0101/0102) ALREADY runs every 3 days company-wide
-- (see 0102's cron 'crm-sales-coaching-3days') -- no change needed there,
-- it already matches the "per 3 hari coaching" ask.
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
    'whatsapp_webhook_silence_alert', 'finance_expense_pending_verification',
    'sales_conduct_warning', 'meta_ads_balance_low', 'content_publish_failed',
    -- This migration
    'database_followup_push'
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
    'meta_ads_balance_low',
    -- This migration
    'database_followup_push'
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
-- crm_run_villa_cariu_database_followup: hardcoded to these two specific
-- projects (not a generic "ads paused" flag, since that concept doesn't
-- exist on crm_projects) -- Loonars Living (villa, Jogja) and Griya Cariu
-- Indah (Cariu, Jabodetabek). Deterministic digest per assigned Sales rep,
-- same shape as crm_run_prospect_analysis's stuck-prospect count, just
-- counting the FULL open database for these two projects (not only
-- 3+ day stuck ones) since the point now is to work through everything,
-- not just what's overdue.
-- ----------------------------------------------------------------------------
create or replace function public.crm_run_villa_cariu_database_followup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_count int;
  v_project_ids uuid[] := array['5f3da604-e6bf-4709-bc69-934c9bb99d17', 'd88d5f85-d60c-47b4-a919-3930b6bbd361'];
begin
  for v_sales in
    select distinct e.id as sales_id, e.full_name
    from public.employees e
    join public.prospects p on p.sales_id = e.id
    where e.deleted_at is null and e.employment_status = 'active'
      and p.deleted_at is null and p.status not in ('closing', 'inactive')
      and p.project_id = any (v_project_ids)
  loop
    select count(*) into v_count
    from public.prospects p
    where p.sales_id = v_sales.sales_id and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and p.project_id = any (v_project_ids);

    if v_count > 0 then
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_sales.sales_id, 'crm', 'database_followup_push',
        'Follow up database Villa/Cariu',
        'Iklan Villa & Cariu sedang dihentikan sementara -- ada ' || v_count || ' prospek di database Anda yang perlu di-follow up satu per satu. Yuk cek Menu Prospek dan hubungi mereka sekarang.',
        '/crm'
      );
    end if;
  end loop;
end;
$$;

comment on function public.crm_run_villa_cariu_database_followup is
  'Twice-daily push (see the two cron schedules below) reminding each Sales rep with open prospects on Loonars Living (villa) or Griya Cariu Indah to work through their existing database one by one, now that Meta ads for these two projects are paused. Company-wide crm_run_sales_coaching (0101/0102) already covers the every-3-days coaching cadence separately.';

-- Twice daily: 09:00 and 16:00 WITA (01:00 and 08:00 UTC).
select cron.schedule('crm-villa-cariu-followup-morning', '0 1 * * *', $$select public.crm_run_villa_cariu_database_followup();$$);
select cron.schedule('crm-villa-cariu-followup-afternoon', '0 8 * * *', $$select public.crm_run_villa_cariu_database_followup();$$);
