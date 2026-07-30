-- ============================================================================
-- MK Connect — 0189: Kepala Cabang salary input -> employee payslip + Super
-- Admin transfer request
--
-- New, deliberately separate from the existing payroll_runs/payroll_items
-- batch module (0056, gated by payroll.manage — HR/Finance/Direktur running
-- a whole branch's payroll at once). This is the single-employee path a
-- Kepala Cabang uses directly: pick one of their own branch's employees,
-- enter the salary amount and the bank account it should land in, submit.
-- That single action:
--   1. Records employee_salary_submissions (one row per employee/period).
--   2. Notifies the employee (category 'payroll_available', already wired to
--      the WhatsApp relay) with their payslip details.
--   3. Notifies every Super Admin (new category 'salary_transfer_request')
--      to actually transfer the money, with the bank account attached.
-- Super Admin then marks it transferred, which notifies the employee once
-- the money is actually on its way (new category 'salary_transferred').
-- ============================================================================

create table public.employee_salary_submissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  branch_id uuid not null references public.branches(id),
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year >= 2020),
  amount numeric(14, 2) not null check (amount > 0),
  bank_name text,
  bank_account_number text not null,
  bank_account_holder text,
  note text,
  status text not null default 'pending_transfer' check (status in ('pending_transfer', 'transferred')),
  submitted_by uuid references public.employees(id),
  transferred_by uuid references public.employees(id),
  transferred_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, period_month, period_year)
);

create index employee_salary_submissions_branch_idx on public.employee_salary_submissions (branch_id);
create index employee_salary_submissions_status_idx on public.employee_salary_submissions (status);

alter table public.employee_salary_submissions enable row level security;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('salary_input.submit', 'Input an individual employee''s salary and bank account, sending them a payslip notification and Super Admin a transfer request'),
  ('salary_input.transfer', 'See salary submissions awaiting transfer and mark them as transferred')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('kepala_cabang', 'hr', 'finance', 'direktur_operasional', 'super_admin')
  and p.key = 'salary_input.submit'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('super_admin', 'finance')
  and p.key = 'salary_input.transfer'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS: submitter's own branch, the employee themselves, or anyone holding
-- salary_input.transfer (Super Admin/Finance) sees every submission.
-- ----------------------------------------------------------------------------
create policy employee_salary_submissions_select on public.employee_salary_submissions for select
  using (
    public.app_has_permission('salary_input.transfer')
    or employee_id = auth.uid()
    or branch_id = (select branch_id from public.employees where id = auth.uid())
  );

-- No direct insert/update policy: every write goes through the RPCs below,
-- which re-check the permission and scope themselves (security definer).

-- ----------------------------------------------------------------------------
-- Notification category additions.
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
    'salary_transfer_request', 'salary_transferred'
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
    -- This migration -- Super Admin needs to hear about a transfer request
    -- immediately, same urgency as finance_expense_pending_verification.
    'salary_transfer_request'
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
-- submit_employee_salary(): the Kepala Cabang action. Inserts the record,
-- notifies the employee with their payslip, and notifies every Super Admin
-- to make the transfer.
-- ----------------------------------------------------------------------------
create or replace function public.submit_employee_salary(
  p_employee_id uuid,
  p_period_month smallint,
  p_period_year smallint,
  p_amount numeric,
  p_bank_name text,
  p_bank_account_number text,
  p_bank_account_holder text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_employee public.employees%rowtype;
  v_id uuid;
  v_admin record;
  v_period text;
begin
  if not public.app_has_permission('salary_input.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_employee from public.employees where id = p_employee_id and deleted_at is null;
  if not found then
    raise exception 'Employee not found';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;

  -- A Kepala Cabang may only submit for their own branch's employees. Anyone
  -- also holding salary_input.transfer (Super Admin/Finance) isn't scoped.
  if not public.app_has_permission('salary_input.transfer') and v_employee.branch_id is distinct from v_caller_branch then
    raise exception 'Karyawan ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  if p_bank_account_number is null or trim(p_bank_account_number) = '' then
    raise exception 'Nomor rekening wajib diisi';
  end if;

  insert into public.employee_salary_submissions (
    employee_id, branch_id, period_month, period_year, amount,
    bank_name, bank_account_number, bank_account_holder, note, submitted_by
  )
  values (
    p_employee_id, v_employee.branch_id, p_period_month, p_period_year, p_amount,
    nullif(trim(p_bank_name), ''), trim(p_bank_account_number), nullif(trim(p_bank_account_holder), ''),
    nullif(trim(p_note), ''), v_caller
  )
  returning id into v_id;

  v_period := to_char(make_date(p_period_year, p_period_month, 1), 'FMMonth YYYY');

  insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
  values (
    p_employee_id, 'system', 'payroll_available',
    'Slip Gaji Anda Tersedia — ' || v_period,
    '💰 Gaji periode ' || v_period || ': Rp ' || to_char(p_amount, 'FM999,999,999,999')
      || E'\n🏦 Ditransfer ke: ' || coalesce(nullif(trim(p_bank_name), ''), '-') || ' ' || trim(p_bank_account_number)
      || case when coalesce(trim(p_bank_account_holder), '') <> '' then ' a.n. ' || trim(p_bank_account_holder) else '' end
      || E'\n\nDana akan ditransfer setelah dikonfirmasi oleh Super Admin.',
    '/hr/salary',
    jsonb_build_object('salary_submission_id', v_id, 'period_month', p_period_month, 'period_year', p_period_year)
  );

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'salary_transfer_request',
      'Permintaan Transfer Gaji — ' || v_employee.full_name,
      '👤 Karyawan: ' || v_employee.full_name
        || E'\n💰 Nominal: Rp ' || to_char(p_amount, 'FM999,999,999,999')
        || E'\n🏦 Rekening: ' || coalesce(nullif(trim(p_bank_name), ''), '-') || ' ' || trim(p_bank_account_number)
        || case when coalesce(trim(p_bank_account_holder), '') <> '' then ' a.n. ' || trim(p_bank_account_holder) else '' end
        || E'\n📅 Periode: ' || v_period
        || E'\n👤 Diinput oleh Kepala Cabang',
      '/hr/salary',
      jsonb_build_object('salary_submission_id', v_id, 'employee_id', p_employee_id)
    );
  end loop;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- mark_salary_transferred(): Super Admin/Finance confirms the transfer went
-- out, which lets the employee know their money is on its way.
-- ----------------------------------------------------------------------------
create or replace function public.mark_salary_transferred(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row public.employee_salary_submissions%rowtype;
  v_period text;
begin
  if not public.app_has_permission('salary_input.transfer') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.employee_salary_submissions
    set status = 'transferred', transferred_by = v_caller, transferred_at = now()
    where id = p_id and status = 'pending_transfer'
    returning * into v_row;

  if not found then
    raise exception 'Pengajuan gaji tidak ditemukan atau sudah ditransfer';
  end if;

  v_period := to_char(make_date(v_row.period_year, v_row.period_month, 1), 'FMMonth YYYY');

  insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
  values (
    v_row.employee_id, 'system', 'salary_transferred',
    'Gaji Anda Telah Ditransfer — ' || v_period,
    '✅ Gaji periode ' || v_period || ' sebesar Rp ' || to_char(v_row.amount, 'FM999,999,999,999')
      || ' telah ditransfer ke rekening ' || v_row.bank_account_number || '.',
    '/hr/salary',
    jsonb_build_object('salary_submission_id', v_row.id)
  );
end;
$$;
