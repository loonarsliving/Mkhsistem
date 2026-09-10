-- ============================================================================
-- MK Connect — 0257: Loonars Coffee weekly report (owner + Vando)
--
-- Follows the exact pattern already established for construction_send_
-- weekly_report (0195, Kendari) and construction_dispatch_progress_
-- assessment (0227): a pg_cron-scheduled function that inserts
-- mkc_notifications rows, which the existing mkc_notifications_whatsapp_
-- trigger auto-relays over WhatsApp via automation_post -- no new delivery
-- mechanism, reusing what's already proven in production.
--
-- Two DIFFERENT reports from the SAME underlying (server-computed, never
-- AI-guessed) numbers, per the brief's section 17/41:
--   - OWNER report -> every Super Admin: physical vs financial progress,
--     budget/committed/actual/remaining, contractor payment status,
--     variance warning when financial progress runs materially ahead of
--     physical progress.
--   - VANDO report -> Vando specifically (matched by name, same
--     convention as his other WhatsApp commands): concise, operational —
--     progress this week, approved/paid/outstanding, no accounting
--     terminology.
-- ============================================================================

create or replace function public.construction_send_loonars_coffee_weekly_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_branch_id uuid;
  v_physical_pct numeric;
  v_material_budget numeric;
  v_labor_budget numeric;
  v_total_budget numeric;
  v_actual numeric;
  v_committed numeric;
  v_remaining numeric;
  v_financial_pct numeric;
  v_contract record;
  v_contract_summary record;
  v_current_week record;
  v_evidence_photos int;
  v_evidence_wbs_logs int;
  v_warning text;
  v_owner_body text;
  v_vando_body text;
  v_admin record;
  v_vando record;
begin
  select p.id, p.name, p.branch_id, p.material_procurement_budget, p.labor_contract_budget, p.total_budget
  into v_project
  from public.construction_projects p
  join public.branches b on b.id = p.branch_id
  where b.code = 'LNC' and p.status = 'active'
  limit 1;

  if v_project.id is null then
    return; -- no active Loonars Coffee project -- nothing to report
  end if;

  v_branch_id := v_project.branch_id;
  v_material_budget := coalesce(v_project.material_procurement_budget, 0);
  v_labor_budget := coalesce(v_project.labor_contract_budget, 0);
  v_total_budget := coalesce(v_project.total_budget, v_material_budget + v_labor_budget);

  -- Physical progress: weighted WBS completion (existing engine, 0209).
  select public.cm_project_overall_progress(v_project.id) into v_physical_pct;

  -- Financial: actual = real cash-out already posted (construction_expenses,
  -- includes both material purchases and approved labor payments, since
  -- cm_approve_labor_payment posts into the same table). Committed =
  -- Loonars Coffee cost requests approved/transferred but not yet posted
  -- (money promised, not yet actually moved).
  select coalesce(sum(amount), 0) into v_actual
    from public.construction_expenses where project_id = v_project.id;

  select coalesce(sum(amount), 0) into v_committed
    from public.construction_cost_requests
    where project_id = v_project.id and status in ('approved', 'transferred');

  v_remaining := greatest(v_total_budget - v_actual - v_committed, 0);
  v_financial_pct := case when v_total_budget > 0 then round(v_actual / v_total_budget * 100, 1) else 0 end;

  -- Contractor (Anang) payment status via the existing earned-value engine.
  select id, contract_value into v_contract from public.cm_labor_contracts where project_id = v_project.id limit 1;
  if v_contract.id is not null then
    select * into v_contract_summary from public.cm_labor_contract_summary(v_contract.id);
  end if;

  -- Current week: the schedule row whose period covers today, else the
  -- most recently started one.
  select * into v_current_week
    from public.cm_labor_weekly_schedule
    where labor_contract_id = v_contract.id and current_date between period_start and period_end
    order by week_number desc limit 1;
  if v_current_week.id is null then
    select * into v_current_week
      from public.cm_labor_weekly_schedule
      where labor_contract_id = v_contract.id and period_start <= current_date
      order by week_number desc limit 1;
  end if;

  -- Evidence coverage: photos + progress logs submitted in the last 7 days.
  select count(*) into v_evidence_wbs_logs
    from public.cm_wbs_progress_log l
    join public.cm_project_wbs w on w.id = l.project_wbs_id
    where w.project_id = v_project.id and l.submitted_at > now() - interval '7 days' and l.photo_url is not null;
  v_evidence_photos := v_evidence_wbs_logs;

  -- Warning per section 16 of the brief: financial materially ahead of
  -- physical is worth flagging; roughly aligned is not.
  v_warning := case
    when v_financial_pct - coalesce(v_physical_pct, 0) > 15 then '⚠️ Pengeluaran finansial lebih cepat dari progress fisik — perlu ditinjau.'
    when coalesce(v_physical_pct, 0) - v_financial_pct > 15 then 'ℹ️ Progress fisik lebih cepat dari pengeluaran finansial.'
    else '✅ Progress fisik dan finansial selaras.'
  end;

  -- ---------------------------------------------------------------------
  -- Owner report
  -- ---------------------------------------------------------------------
  v_owner_body :=
    '🏗️ *LOONARS COFFEE*' || coalesce(' — Minggu ' || v_current_week.week_number, '') || E'\n\n' ||
    '📈 Progress fisik: ' || coalesce(v_physical_pct, 0) || '%' || E'\n' ||
    '💹 Progress finansial: ' || v_financial_pct || '%' || E'\n\n' ||
    '💰 Anggaran (material + kontraktor): Rp ' || to_char(v_total_budget, 'FM999,999,999,999') || E'\n' ||
    '💸 Aktual sudah dikeluarkan: Rp ' || to_char(v_actual, 'FM999,999,999,999') || E'\n' ||
    '📝 Committed (disetujui, belum dibayar): Rp ' || to_char(v_committed, 'FM999,999,999,999') || E'\n' ||
    '📊 Sisa anggaran: Rp ' || to_char(v_remaining, 'FM999,999,999,999') || E'\n\n' ||
    coalesce(
      '👷 Kontraktor (Anang): kontrak Rp ' || to_char(v_contract_summary.contract_value, 'FM999,999,999,999') ||
      ', sudah dibayar Rp ' || to_char(v_contract_summary.cumulative_paid, 'FM999,999,999,999') ||
      ', earned belum dibayar Rp ' || to_char(v_contract_summary.payable, 'FM999,999,999,999') || E'\n\n',
      ''
    ) ||
    coalesce('🎯 Target minggu ini: ' || v_current_week.planned_progress_pct || '% (rencana bayar Rp ' || to_char(v_current_week.planned_payment, 'FM999,999,999,999') || ')' || E'\n', '') ||
    '📸 Evidence 7 hari terakhir: ' || v_evidence_photos || ' foto/laporan progress' || E'\n\n' ||
    v_warning;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'construction_project_weekly_report',
      'Laporan Mingguan — Loonars Coffee',
      v_owner_body,
      '/construction-finance',
      jsonb_build_object('project_id', v_project.id, 'recipient', 'owner')
    );
  end loop;

  -- ---------------------------------------------------------------------
  -- Vando report — concise, operational, no accounting terms (per the
  -- brief's explicit "Vando should not need to understand the database or
  -- accounting structure").
  -- ---------------------------------------------------------------------
  v_vando_body :=
    'LOONARS COFFEE' || coalesce(' — MINGGU ' || v_current_week.week_number, '') || E'\n\n' ||
    'Progress: ' || coalesce(v_physical_pct, 0) || '%' || E'\n\n' ||
    coalesce(
      'Disetujui: Rp ' || to_char(v_contract_summary.payable + v_contract_summary.cumulative_paid, 'FM999,999,999,999') || E'\n' ||
      'Sudah dibayar: Rp ' || to_char(v_contract_summary.cumulative_paid, 'FM999,999,999,999') || E'\n' ||
      'Outstanding: Rp ' || to_char(v_contract_summary.payable, 'FM999,999,999,999') || E'\n\n',
      ''
    ) ||
    coalesce('Target minggu ini: ' || v_current_week.planned_progress_pct || '%' || E'\n\n', '') ||
    'Kirim foto/laporan progress kalau ada pekerjaan yang belum terdokumentasi ya, Vando.';

  for v_vando in
    select id from public.employees
    where deleted_at is null and employment_status = 'active' and full_name ilike '%vando%'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_vando.id, 'system', 'construction_project_weekly_report',
      'Laporan Progress — Loonars Coffee',
      v_vando_body,
      '/construction-finance',
      jsonb_build_object('project_id', v_project.id, 'recipient', 'vando')
    );
  end loop;
end;
$$;

comment on function public.construction_send_loonars_coffee_weekly_report is
  'Weekly WhatsApp report for Loonars Coffee -- detailed version to every Super Admin, concise operational version to Vando. Scheduled Saturday by pg_cron. All figures server-computed (cm_project_overall_progress, cm_labor_contract_summary, construction_expenses/construction_cost_requests sums) -- never AI-narrated numbers.';

-- Notification category.
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
    'new_ad_lead', 'content_published', 'content_publish_reminder', 'finance_expense_alert',
    'branch_balance_alert', 'sales_coaching_tip', 'ad_lead_followup_reminder', 'ad_lead_escalation_branch',
    'ad_lead_escalation_director', 'whatsapp_webhook_silence_alert', 'finance_expense_pending_verification',
    'sales_conduct_warning', 'meta_ads_balance_low', 'content_publish_failed', 'database_followup_push',
    'lead_wants_info', 'loonars_fee_alert', 'automation_dispatch_failed', 'automation_job_dead_letter',
    'automation_queue_stalled', 'disciplinary_warning', 'employee_terminated', 'content_review_pending',
    'salary_transfer_request', 'salary_transferred', 'salary_transfer_summary',
    'construction_expense_submitted', 'construction_weekly_report', 'material_purchase_missing_photo',
    'construction_progress_report', 'approval_request_submitted', 'approval_request_decided',
    'lead_hot_handoff', 'pending_question_timeout',
    'construction_cost_request_submitted', 'construction_cost_request_decided',
    -- This migration
    'construction_project_weekly_report'
  ]));

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
    'content_review_pending',
    'salary_transfer_summary',
    'construction_expense_submitted',
    'construction_weekly_report',
    'material_purchase_missing_photo',
    'construction_progress_report',
    'approval_request_submitted', 'approval_request_decided',
    'labor_payment_pending_approval',
    'salary_transferred',
    'construction_cost_request_submitted', 'construction_cost_request_decided',
    -- This migration
    'construction_project_weekly_report'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;

-- Saturday 06:00 UTC = 13:00 WIB, same slot as the existing block-level
-- Saturday progress report (0199) -- Loonars Coffee's weekly report is a
-- separate, project-scoped cadence rather than reusing that Kendari/
-- Loonars-Living-specific job.
select cron.schedule(
  'loonars-coffee-weekly-report',
  '0 6 * * 6',
  $$select public.construction_send_loonars_coffee_weekly_report();$$
);
