-- ============================================================================
-- MK Connect — 0119: Ad-lead escalation at 30 minutes (not after 3 daily
-- reminders), and a way to pause routing new leads to a specific sales rep
--
-- 1. crm_run_ad_lead_monitoring() previously reminded Sales up to 3x across
--    the day (2h/8h/16h) before escalating to Kepala Cabang. Owner wants
--    leads followed up fast -- 30 minutes of silence now escalates directly
--    to Kepala Cabang, skipping the sales-reminder cascade entirely. The
--    24h Direktur Operasional safety net is unchanged.
--
-- 2. employees.ads_lead_routing_paused: a sales rep can be paused from
--    receiving new ad-driven leads (crm_pick_round_robin_sales) and from
--    being a reassignment target (crm_pick_round_robin_sales_excluding)
--    without touching their employment_status -- they're still an active
--    employee, just not currently trusted with fresh leads.
-- ============================================================================

alter table public.employees add column ads_lead_routing_paused boolean not null default false;
comment on column public.employees.ads_lead_routing_paused is
  'When true, this sales rep is skipped by crm_pick_round_robin_sales (new ad leads) and crm_pick_round_robin_sales_excluding (LEMPAR reassignment target) -- set manually when a sales rep stops responding to leads, without touching employment_status.';

create or replace function public.crm_pick_round_robin_sales(p_branch_id uuid)
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  join public.roles r on r.id = e.role_id
  where e.branch_id = p_branch_id
    and r.key = 'sales'
    and e.deleted_at is null
    and e.employment_status = 'active'
    and not e.ads_lead_routing_paused
  order by (
    select max(p.created_at) from public.prospects p
    where p.sales_id = e.id and p.lead_source = 'facebook_ads' and p.deleted_at is null
  ) asc nulls first
  limit 1;
$$;

create or replace function public.crm_pick_round_robin_sales_excluding(p_branch_id uuid, p_exclude_sales_id uuid)
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  join public.roles r on r.id = e.role_id
  where e.branch_id = p_branch_id
    and r.key = 'sales'
    and e.deleted_at is null
    and e.employment_status = 'active'
    and not e.ads_lead_routing_paused
    and e.id <> p_exclude_sales_id
  order by (
    select max(p.created_at) from public.prospects p
    where p.sales_id = e.id and p.lead_source = 'facebook_ads' and p.deleted_at is null
  ) asc nulls first
  limit 1;
$$;

create or replace function public.crm_run_ad_lead_monitoring()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_hours_since_created numeric;
  v_manager record;
  v_dirops record;
begin
  for v_lead in
    select
      p.id, p.customer_name, p.phone, p.phone_normalized, p.sales_id, p.branch_id, p.created_at,
      e.full_name as sales_name, b.name as branch_name
    from public.prospects p
    join public.employees e on e.id = p.sales_id
    join public.branches b on b.id = p.branch_id
    where p.lead_source = 'facebook_ads'
      and p.created_by is null
      and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and p.last_follow_up_at is null
      and p.created_at >= '2026-07-17T04:47:44Z'::timestamptz
  loop
    v_hours_since_created := extract(epoch from (now() - v_lead.created_at)) / 3600;

    if v_hours_since_created >= 0.5 and not exists (
      select 1 from public.mkc_notifications
      where category = 'ad_lead_escalation_branch' and (metadata ->> 'prospect_id') = v_lead.id::text
    ) then
      for v_manager in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.branch_id = v_lead.branch_id and em.deleted_at is null and em.employment_status = 'active' and r.key = 'kepala_cabang'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_manager.id, 'crm', 'ad_lead_escalation_branch',
          'Lead belum di-follow up dalam 30 menit',
          'Sales ' || v_lead.sales_name || ' belum follow up lead dari iklan (' || coalesce(v_lead.customer_name, '-') || ', ' || v_lead.phone
            || ') dalam 30 menit terakhir. Jika ingin mengalihkan ke Sales lain di cabang Anda, balas pesan ini dengan "LEMPAR '
            || right(coalesce(v_lead.phone_normalized, ''), 4)
            || '" -- sistem akan otomatis memindahkan lead ini secara adil (round robin) dan memberi tahu Sales baru beserta nomor HP lead-nya.',
          '/crm/' || v_lead.id,
          jsonb_build_object('prospect_id', v_lead.id, 'kind', 'branch_escalation')
        );
      end loop;
    end if;

    if v_hours_since_created >= 24 and not exists (
      select 1 from public.mkc_notifications
      where category = 'ad_lead_escalation_director' and (metadata ->> 'prospect_id') = v_lead.id::text
    ) then
      for v_dirops in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'direktur_operasional'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_dirops.id, 'crm', 'ad_lead_escalation_director',
          'Lead belum ditindaklanjuti 24+ jam',
          'Lead dari iklan untuk cabang ' || v_lead.branch_name || ' (Sales: ' || v_lead.sales_name || ', '
            || coalesce(v_lead.customer_name, '-') || ', ' || v_lead.phone || ') masih belum di-follow up setelah 24 jam. Mohon perhatian.',
          '/crm/' || v_lead.id,
          jsonb_build_object('prospect_id', v_lead.id, 'kind', 'director_escalation')
        );
      end loop;
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- New WA-eligible category for a direct conduct warning to a specific
-- employee (distinct from the formal SP1 letter flow -- this is an
-- immediate, informal-but-firm message, not a drafted/reviewed letter).
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
    -- This migration
    'sales_conduct_warning'
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
    -- This migration
    'sales_conduct_warning'
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
