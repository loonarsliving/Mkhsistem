-- ============================================================================
-- MK Connect — 0104: AI Lead Dispatcher follow-up monitoring & escalation
--
-- Lead capture, project detection, and round-robin assignment already exist
-- (0092_ad_lead_routing.sql, lib/ai/domains/ad-lead-routing.ts) -- a
-- Click-to-WhatsApp ad click already auto-creates a prospects row
-- (lead_source='facebook_ads') and notifies the assigned sales rep. What
-- was missing is the monitoring layer: "sudah follow up" here means the
-- sales rep logged a real follow-up activity (crm_add_follow_up sets
-- prospects.last_follow_up_at) -- there's no separate "Lead" entity to
-- duplicate into a Prospect, the prospect already exists from routing.
--
-- Runs every 15 minutes (fine enough grain for an hourly reminder without
-- real drift):
--   - Every 1 hour an ad-driven lead sits with last_follow_up_at still
--     null, nudge the assigned Sales again via WhatsApp.
--   - At 12 hours unfollowed, escalate once to the branch's Kepala Cabang.
--   - At 24 hours unfollowed, escalate once further to Direktur
--     Operasional (24h is a starting point, not a policy carved in stone --
--     the user's spec left this second threshold to "company policy",
--     easy to tune later).
--
-- Only applies to leads created after this migration lands -- deliberately
-- excludes the ~35 pre-existing facebook_ads prospects so turning this on
-- doesn't blast a backlog of reminders/escalations for old leads nobody
-- was tracking against these new SLAs.
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
    -- This migration
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director'
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
    -- This migration
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director'
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
      p.id, p.customer_name, p.phone, p.sales_id, p.branch_id, p.created_at, p.last_reminder_sent_at,
      e.full_name as sales_name, b.name as branch_name
    from public.prospects p
    join public.employees e on e.id = p.sales_id
    join public.branches b on b.id = p.branch_id
    where p.lead_source = 'facebook_ads'
      and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and p.last_follow_up_at is null
      and p.created_at >= '2026-07-17T04:47:44Z'::timestamptz
  loop
    v_hours_since_created := extract(epoch from (now() - v_lead.created_at)) / 3600;

    -- Hourly reminder to the assigned Sales while still unfollowed.
    if v_hours_since_created >= 1
       and (v_lead.last_reminder_sent_at is null or now() - v_lead.last_reminder_sent_at >= interval '1 hour')
    then
      insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
      values (
        v_lead.sales_id, 'crm', 'ad_lead_followup_reminder',
        'Lead dari iklan belum di-follow up',
        'Anda memiliki lead dari iklan (' || coalesce(v_lead.customer_name, 'Tidak diketahui') || ', ' || v_lead.phone
          || ') yang belum di-follow up. Silakan hubungi pelanggan dan input follow up-nya di Menu Prospek.',
        '/crm/' || v_lead.id,
        jsonb_build_object('prospect_id', v_lead.id, 'kind', 'sales_reminder')
      );
      update public.prospects set last_reminder_sent_at = now() where id = v_lead.id;
    end if;

    -- 12h: escalate once to the branch's Kepala Cabang.
    if v_hours_since_created >= 12 and not exists (
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
          'Lead belum ditindaklanjuti 12+ jam',
          'MK Connect telah memberikan lead kepada Sales ' || v_lead.sales_name || ' (' || coalesce(v_lead.customer_name, 'lead dari iklan')
            || ', ' || v_lead.phone || '), namun hingga saat ini belum ada follow up. Mohon dilakukan pengecekan.',
          '/crm/' || v_lead.id,
          jsonb_build_object('prospect_id', v_lead.id, 'kind', 'branch_escalation')
        );
      end loop;
    end if;

    -- 24h: escalate once further to Direktur Operasional.
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

comment on function public.crm_run_ad_lead_monitoring is
  'Every 15 min: hourly WhatsApp reminder to Sales for unfollowed ad-driven leads, escalating once to Kepala Cabang at 12h and once further to Direktur Operasional at 24h. Only covers leads created after this migration (see WHERE clause) -- pre-existing backlog is excluded.';

select cron.schedule('crm-ad-lead-monitoring-15min', '*/15 * * * *', $$select public.crm_run_ad_lead_monitoring();$$);
