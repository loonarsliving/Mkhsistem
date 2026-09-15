-- ============================================================================
-- MK Connect — 0260: Restrict WhatsApp-forwarded notifications to
-- finance/construction/birthday (+ system-health) categories only
--
-- Owner's explicit direction (2026-09-13): turn off WhatsApp delivery for
-- every employee-facing notification category EXCEPT finance, construction,
-- and birthday_wish. This does NOT touch how/whether a notification is
-- created (mkc_notifications inserts are untouched everywhere) -- it only
-- narrows this trigger's allowlist, so every notification still appears
-- in-app; only the WhatsApp forward stops for the removed categories.
--
-- Kept, and why:
--   - finance_expense_alert, finance_expense_pending_verification,
--     finance_expense_duplicate_rejected, branch_balance_alert,
--     salary_transfer_summary, salary_transferred,
--     labor_payment_pending_approval, material_purchase_missing_photo
--     -- explicit "keuangan" (finance) category.
--   - construction_expense_submitted, construction_weekly_report,
--     construction_progress_report, construction_cost_request_submitted,
--     construction_cost_request_decided, construction_project_weekly_report
--     -- explicit "konstruksi" (construction) category.
--   - birthday_wish -- explicit exception named by the owner.
--   - whatsapp_webhook_silence_alert, automation_dispatch_failed,
--     automation_job_dead_letter, automation_queue_stalled -- NOT an
--     employee-facing notification at all (system/ops health alerts, e.g.
--     "the WA webhook has gone silent" or "a background job is dead-
--     lettered") -- kept on the judgment call that turning these off would
--     silently remove the only warning that the notification pipeline
--     itself has broken. Flagged explicitly to the owner; easy to remove
--     from this array later if that judgment call is wrong.
--
-- Removed: every attendance/HR, sales/CRM, markom, ads, and generic
-- task/approval category (attendance_reminder, late_attendance,
-- forgot_checkout, new_memo, target_reminder, weekly_reminder,
-- markom_new_task, task_revision, payroll_available, waiting_approval,
-- project_progress, material_request, inspection_reminder,
-- stuck_prospect_reminder, stuck_prospect_alert, branch_target_reminder,
-- sp1_pending_review, sp1_issued, sp1_escalation, task_pending_verification,
-- daily_motivation, daily_report, ad_campaign_launched, ad_campaign_failed,
-- sales_coaching_tip, ad_lead_followup_reminder, ad_lead_escalation_branch,
-- ad_lead_escalation_director, sales_conduct_warning, meta_ads_balance_low,
-- lead_wants_info, loonars_fee_alert, content_review_pending,
-- approval_request_submitted, approval_request_decided).
-- ============================================================================

create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if new.category = any (array[
    -- Keuangan (finance)
    'finance_expense_alert', 'finance_expense_pending_verification',
    'finance_expense_duplicate_rejected', 'branch_balance_alert',
    'salary_transfer_summary', 'salary_transferred',
    'labor_payment_pending_approval', 'material_purchase_missing_photo',
    -- Konstruksi (construction)
    'construction_expense_submitted', 'construction_weekly_report',
    'construction_progress_report', 'construction_cost_request_submitted',
    'construction_cost_request_decided', 'construction_project_weekly_report',
    -- Ulang tahun (birthday) -- explicit exception
    'birthday_wish',
    -- System/ops health, not an employee notification -- see header comment
    'whatsapp_webhook_silence_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$function$;
