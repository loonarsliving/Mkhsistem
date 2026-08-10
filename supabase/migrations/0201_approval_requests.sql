-- ============================================================================
-- MK Connect — 0201: WhatsApp-only approval requests
--
-- Owner's ask: a simple approval system for Kepala Cabang -- pricelist,
-- photos, anything -- where Super Admin can approve/reject with one WA
-- reply, no app needed on either side. A table in the app shows the full
-- history (pending + decided) for anyone who wants to look it up later.
--
-- Flow: Kepala Cabang sends "AJUKAN <detail>" (text and/or photo caption)
-- -> row created with a short human-readable code (AP-0001, ...) -> every
-- Super Admin gets a WA message with the code + content -> replies
-- "SETUJU <code>" or "TOLAK <code> <alasan>" -> requester gets notified of
-- the decision. If exactly one request is pending, the code can be
-- omitted in the reply.
-- ============================================================================

create sequence public.approval_request_code_seq;

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('AP-' || lpad(nextval('public.approval_request_code_seq')::text, 4, '0')),
  requester_employee_id uuid not null references public.employees(id),
  branch_id uuid references public.branches(id),
  request_text text,
  image_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.employees(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (request_text is not null or image_url is not null)
);
create index approval_requests_status_idx on public.approval_requests (status, created_at desc);
create index approval_requests_requester_idx on public.approval_requests (requester_employee_id);

alter table public.approval_requests enable row level security;

comment on table public.approval_requests is
  'WhatsApp-only approval flow: Kepala Cabang submits (text/photo, "AJUKAN ..."), Super Admin decides by replying SETUJU/TOLAK <code>. No app-side submission or decision UI -- the app page is read-only history/status.';

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('approval_request.view_own', 'View own approval requests and their status'),
  ('approval_request.manage', 'View every approval request across branches (decisions are made via WhatsApp, not this app)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'kepala_cabang' and p.key = 'approval_request.view_own'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin' and p.key = 'approval_request.manage'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS: own submissions, or anyone holding the manage permission (every branch).
-- No insert/update policy -- writes only via the webhook handler's admin client.
-- ----------------------------------------------------------------------------
create policy approval_requests_select on public.approval_requests for select
  using (
    public.app_has_permission('approval_request.manage')
    or requester_employee_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- Notification categories.
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
    'salary_transfer_request', 'salary_transferred', 'salary_transfer_summary',
    'construction_expense_submitted',
    'construction_weekly_report',
    'material_purchase_missing_photo',
    'construction_progress_report',
    -- This migration
    'approval_request_submitted', 'approval_request_decided'
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
    -- This migration
    'approval_request_submitted', 'approval_request_decided'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;
