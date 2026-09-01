-- Owner's ask: gaji should work like bahan/tukang -- Super Admin sends the
-- bukti transfer photo via WhatsApp, and it's automatically matched, marked
-- transferred, and forwarded to the Kepala Cabang + employee -- instead of
-- Super Admin manually clicking "Sudah Ditransfer" in the web app with no
-- photo ever recorded or forwarded anywhere.
--
-- Also fixes a real gap found while building this: 'salary_transferred'
-- (the employee-facing "gaji Anda telah ditransfer" notification, both the
-- existing manual mark_salary_transferred() button AND this new WA-photo
-- flow use it) was never in the WhatsApp trigger's allowlist -- the
-- notification was created but only ever showed in-app (bell icon), never
-- reached the employee's WhatsApp at all, silently, since 0189.
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
    -- This migration
    'salary_transferred'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;
