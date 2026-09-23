-- ============================================================================
-- MK Connect — 0276: loonars_fee_alert forwards to WhatsApp again -- it's a
-- finance matter
--
-- Owner's correction to 0260 (2026-09-13): that migration stopped WhatsApp
-- forwarding for every non-finance/construction/birthday notification
-- category, including loonars_fee_alert (siteplan unit-purchase and fee-
-- claim alerts). The owner's point: a sales fee claim is money the company
-- pays out -- it belongs in the "keuangan" (finance) bucket 0260 explicitly
-- kept, not the general employee-notification bucket it got swept into.
--
-- Does not touch how/whether a notification is created (mkc_notifications
-- inserts are untouched everywhere, per 0260's own header comment) -- only
-- adds this one category back to the WhatsApp-forward allowlist.
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
    -- Siteplan unit purchase + fee claim alerts -- a fee claim is a real
    -- payout, so this is a finance matter too (0276, owner's explicit call).
    'loonars_fee_alert',
    -- Konstruksi (construction)
    'construction_expense_submitted', 'construction_weekly_report',
    'construction_progress_report', 'construction_cost_request_submitted',
    'construction_cost_request_decided', 'construction_project_weekly_report',
    -- Ulang tahun (birthday) -- explicit exception
    'birthday_wish',
    -- System/ops health, not an employee notification -- see 0260's header comment
    'whatsapp_webhook_silence_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$function$;
