-- ============================================================================
-- MK Connect — 0190: Consolidate Super Admin salary-transfer alerts into one
-- WhatsApp message per branch, instead of one per employee.
--
-- 0189 sent Super Admin a separate WhatsApp message for every single
-- submit_employee_salary() call -- fine for one employee, but a Kepala
-- Cabang running payroll for a whole branch in one sitting (as happened
-- today, 7 employees back-to-back) meant 7 separate WhatsApp messages to
-- Super Admin in a few minutes. Per owner's request: stop the per-employee
-- WhatsApp send, keep the in-app notification (still useful for the bell/
-- history), and add an explicit "send summary" action a Kepala Cabang uses
-- once they're done inputting -- one WhatsApp message per branch, listing
-- every still-pending employee's name and bank account together.
-- ============================================================================

alter table public.employee_salary_submissions add column summary_sent_at timestamptz;

-- ----------------------------------------------------------------------------
-- New category for the consolidated message. salary_transfer_request stays
-- in the allowlist (existing rows still reference it, and it still shows in
-- the in-app notification center) but is removed from the WhatsApp trigger
-- below -- it no longer pushes to WhatsApp on its own.
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
    'sales_conduct_warning', 'meta_ads_balance_low', 'content_publish_failed', 'database_followup_push',
    'lead_wants_info', 'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    'disciplinary_warning', 'employee_terminated', 'content_review_pending',
    'salary_transfer_request', 'salary_transferred',
    -- This migration
    'salary_transfer_summary'
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
    -- salary_transfer_request deliberately removed here (this migration) --
    -- the per-employee WhatsApp ping is replaced by salary_transfer_summary,
    -- sent explicitly once a Kepala Cabang finishes inputting a batch.
    'salary_transfer_summary'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- send_salary_transfer_summary(): explicit action, one WhatsApp message per
-- branch listing every still-pending, not-yet-summarized submission's
-- employee name, amount, and bank account. Marks them summarized so a
-- second press doesn't repeat already-sent lines.
-- ----------------------------------------------------------------------------
create or replace function public.send_salary_transfer_summary(p_branch_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_target_branch uuid;
  v_branch_name text;
  v_row record;
  v_lines text := '';
  v_total numeric(14, 2) := 0;
  v_count int := 0;
  v_admin record;
  v_ids uuid[] := '{}';
begin
  if not public.app_has_permission('salary_input.submit') and not public.app_has_permission('salary_input.transfer') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;

  -- A Kepala Cabang (no salary_input.transfer) can only summarize their own
  -- branch, regardless of what they pass in. Super Admin/Finance may target
  -- any branch, or default to their own if none given.
  if public.app_has_permission('salary_input.transfer') then
    v_target_branch := coalesce(p_branch_id, v_caller_branch);
  else
    v_target_branch := v_caller_branch;
  end if;

  if v_target_branch is null then
    raise exception 'Cabang tidak ditemukan';
  end if;

  select name into v_branch_name from public.branches where id = v_target_branch;

  for v_row in
    select s.id, s.amount, s.bank_name, s.bank_account_number, s.bank_account_holder, e.full_name
    from public.employee_salary_submissions s
    join public.employees e on e.id = s.employee_id
    where s.branch_id = v_target_branch and s.status = 'pending_transfer' and s.summary_sent_at is null
    order by s.created_at
  loop
    v_count := v_count + 1;
    v_total := v_total + v_row.amount;
    v_ids := v_ids || v_row.id;
    v_lines := v_lines || E'\n' || v_count || '. ' || v_row.full_name
      || ' — Rp ' || to_char(v_row.amount, 'FM999,999,999,999')
      || E'\n   ' || coalesce(nullif(trim(v_row.bank_name), ''), '-') || ' ' || v_row.bank_account_number
      || case when coalesce(trim(v_row.bank_account_holder), '') <> '' then ' a.n. ' || trim(v_row.bank_account_holder) else '' end;
  end loop;

  if v_count = 0 then
    raise exception 'Tidak ada pengajuan gaji yang perlu dikirim untuk cabang ini';
  end if;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'salary_transfer_summary',
      'Ringkasan Transfer Gaji — ' || coalesce(v_branch_name, '-') || ' (' || v_count || ' karyawan)',
      'Total: Rp ' || to_char(v_total, 'FM999,999,999,999') || v_lines,
      '/hr/salary',
      jsonb_build_object('branch_id', v_target_branch, 'submission_ids', to_jsonb(v_ids), 'count', v_count)
    );
  end loop;

  update public.employee_salary_submissions set summary_sent_at = now() where id = any (v_ids);

  return v_count;
end;
$$;
