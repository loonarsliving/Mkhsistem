-- ============================================================================
-- MK Connect — 0101: AI sales coaching for reps with 0 closings
--
-- Deliberately a NEW, separate function from both crm_run_prospect_analysis
-- (3-day "stuck prospect" nudge, unrelated to closings) and
-- crm_run_sp1_evaluation (0076, monthly formal warning that only fires on
-- near-total inactivity -- fewer than 3 new prospects AND zero follow-up
-- activity AND zero closings in 30 days). A sales rep can be actively
-- working prospects and still have 0 closings -- that's a coaching moment,
-- not a warning, so it needs its own, much broader trigger (0 closings in
-- 30 days, full stop) and its own supportive tone. Weekly cadence: frequent
-- enough to help without message fatigue.
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in ('whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft', 'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching'));

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
    -- This migration
    'sales_coaching_tip'
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
    -- This migration
    'sales_coaching_tip'
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
-- crm_sales_coaching_log: idempotency guard so a rep isn't coached more than
-- once a week even if the cron reruns.
-- ----------------------------------------------------------------------------
create table public.crm_sales_coaching_log (
  id uuid primary key default gen_random_uuid(),
  sales_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index crm_sales_coaching_log_sales_idx on public.crm_sales_coaching_log (sales_id, created_at desc);
alter table public.crm_sales_coaching_log enable row level security;

comment on table public.crm_sales_coaching_log is
  'One row per AI sales-coaching nudge sent (crm_run_sales_coaching) -- throttles to at most once every 7 days per sales rep.';

create or replace function public.crm_run_sales_coaching()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_closings_30d int;
begin
  for v_sales in
    select distinct e.id as sales_id, e.branch_id, e.full_name
    from public.employees e
    join public.prospects p on p.sales_id = e.id
    where e.deleted_at is null and e.employment_status = 'active'
      and p.deleted_at is null and p.status not in ('closing', 'inactive')
  loop
    select count(*) into v_closings_30d from public.prospects
    where sales_id = v_sales.sales_id and status = 'closing' and closed_at is not null
      and closed_at >= now() - interval '30 days';

    if v_closings_30d = 0 and not exists (
      select 1 from public.crm_sales_coaching_log
      where sales_id = v_sales.sales_id and created_at >= now() - interval '7 days'
    ) then
      insert into public.ai_job_queue (job_type, payload)
      values ('crm_sales_coaching', jsonb_build_object('sales_id', v_sales.sales_id));

      insert into public.crm_sales_coaching_log (sales_id) values (v_sales.sales_id);
    end if;
  end loop;
end;
$$;

comment on function public.crm_run_sales_coaching is
  'Weekly: enqueues an AI coaching nudge (crm_sales_coaching job -> generateSalesCoaching) for every active sales rep with 0 closings in the last 30 days. Broader and softer than SP1 (0076) -- this is coaching, not a warning.';

-- Weekly, Monday 02:00 UTC = 10:00 WITA.
select cron.schedule('crm-sales-coaching-weekly', '0 2 * * 1', $$select public.crm_run_sales_coaching();$$);
