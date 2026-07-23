-- ============================================================================
-- MK Connect — 0063: AI Operating System integration layer
--
-- Brings the AI Engine / Gemini Provider / AI Connector Layer / WhatsApp
-- Cloud API / Notification Engine ported from the (now-retired) standalone
-- Aiagent project into MK Connect as an internal service. No existing
-- table, RPC, or RLS policy for CRM/Finance/Attendance/Memo is touched
-- except two additive changes explicitly called out below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ai_integration_logs: one row per request that crosses a connector boundary
-- (outgoing WhatsApp send, incoming webhook event), mirroring sync_log's
-- shape/RLS posture — reachable only via the service-role client
-- (lib/ai/integration-log.ts), never PostgREST from the browser.
-- ----------------------------------------------------------------------------
create table public.ai_integration_logs (
  id uuid primary key default gen_random_uuid(),
  connector text not null check (connector in ('whatsapp')),
  direction text not null check (direction in ('outgoing', 'incoming')),
  payload jsonb not null,
  status text not null check (status in ('success', 'error')),
  response_status int,
  error text,
  latency_ms int,
  created_at timestamptz not null default now()
);
alter table public.ai_integration_logs enable row level security;
create index ai_integration_logs_connector_created_idx on public.ai_integration_logs (connector, created_at desc);

comment on table public.ai_integration_logs is
  'AI Connector Layer telemetry (last webhook/incoming/outgoing/latency/error) — one row per request crossing a connector boundary. Service-role only.';

-- ----------------------------------------------------------------------------
-- ai_conversations: one row per inbound WhatsApp message handled by the AI
-- Router, for audit/debugging. Service-role only (written by the webhook
-- handler's admin client, never by an authenticated user session).
-- ----------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  connector text not null check (connector in ('whatsapp')),
  sender text not null,
  employee_id uuid references public.employees(id) on delete set null,
  inbound_text text not null,
  reply_text text,
  created_at timestamptz not null default now()
);
alter table public.ai_conversations enable row level security;
create index ai_conversations_sender_idx on public.ai_conversations (sender, created_at desc);

comment on table public.ai_conversations is
  'AI Router conversation log for inbound WhatsApp messages handled by MK Connect AI. Service-role only.';

-- ----------------------------------------------------------------------------
-- New notification category for the Sales Target reminder job below.
-- Additive only — every existing category/value is unchanged.
-- ----------------------------------------------------------------------------
alter table public.mkc_notifications drop constraint mkc_notifications_category_check;
alter table public.mkc_notifications add constraint mkc_notifications_category_check
  check (category is null or category = any (array[
    -- HR
    'attendance_reminder', 'late_attendance', 'forgot_checkout', 'leave_approved', 'leave_rejected', 'payroll_available',
    -- CRM
    'new_prospect', 'follow_up_reminder', 'new_assignment', 'closing_approved', 'customer_verification', 'target_reminder',
    -- Markom
    'markom_new_task', 'task_revision', 'task_approved', 'weekly_reminder',
    -- Project
    'project_progress', 'material_request', 'inspection_reminder',
    -- Finance
    'payment_received', 'invoice_due', 'reimbursement_approved',
    -- Approvals (generic, cross-cutting)
    'waiting_approval', 'approved', 'rejected',
    -- Announcements / Memo
    'new_announcement', 'new_memo',
    -- System
    'maintenance', 'version_update', 'emergency_notice'
  ]));

-- ----------------------------------------------------------------------------
-- Wire the Reminder Payroll category to its one real trigger point:
-- approve_payroll_run already creates one payroll_items row per employee;
-- it just never told the employee. Full CREATE OR REPLACE restatement —
-- only the notification insert inside the loop is new, every other line is
-- unchanged from 0056_hr_payroll_expense_sync.sql.
-- ----------------------------------------------------------------------------
create or replace function public.approve_payroll_run(p_payroll_run_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.payroll_runs%rowtype;
  v_item jsonb;
  v_employee_id uuid;
  v_net numeric(14, 2);
  v_total numeric(14, 2) := 0;
begin
  if not public.app_has_permission('payroll.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_run from public.payroll_runs where id = p_payroll_run_id for update;
  if not found then
    raise exception 'Payroll run not found';
  end if;
  if v_run.status <> 'draft' then
    raise exception 'Payroll run already approved';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one salary line is required';
  end if;

  update public.payroll_runs
    set status = 'approved', approved_by = v_user_id, approved_at = now()
    where id = p_payroll_run_id;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'payroll_run_approved', 'payroll_runs', p_payroll_run_id,
    'mkc:payroll_run:' || p_payroll_run_id,
    jsonb_build_object(
      'payroll_run_id', p_payroll_run_id,
      'branch_id', v_run.branch_id,
      'period_month', v_run.period_month,
      'period_year', v_run.period_year
    )
  )
  on conflict (idempotency_key) do nothing;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_net := coalesce((v_item ->> 'base_salary')::numeric, 0)
           + coalesce((v_item ->> 'allowances')::numeric, 0)
           - coalesce((v_item ->> 'deductions')::numeric, 0);
    v_total := v_total + v_net;
    v_employee_id := (v_item ->> 'employee_id')::uuid;

    insert into public.payroll_items (payroll_run_id, employee_id, base_salary, allowances, deductions, net_salary)
    values (p_payroll_run_id, v_employee_id, coalesce((v_item ->> 'base_salary')::numeric, 0),
      coalesce((v_item ->> 'allowances')::numeric, 0), coalesce((v_item ->> 'deductions')::numeric, 0), v_net);

    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_employee_id, 'hr', 'payroll_available', 'Slip gaji tersedia',
      'Slip gaji periode ' || v_run.period_month || '/' || v_run.period_year || ' sebesar Rp ' || to_char(v_net, 'FM999,999,999,999') || ' telah tersedia.',
      '/hr/finance-sync'
    );
  end loop;

  update public.payroll_runs set total_amount = v_total where id = p_payroll_run_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Reminder Target Sales: weekly digest of current-month target achievement
-- per active Sales rep with at least one target line — same computation
-- crm_sales_stats already performs, inlined here (SECURITY DEFINER
-- background jobs have no auth.uid() session, so crm_sales_stats's own
-- permission check can't be reused directly), following the same
-- direct-table-scan pattern as crm_run_follow_up_reminders/markom_weekly_reminder.
-- ----------------------------------------------------------------------------
create or replace function public.ai_send_sales_target_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month smallint := extract(month from now())::smallint;
  v_year smallint := extract(year from now())::smallint;
  v_row record;
begin
  for v_row in
    select
      st.sales_id,
      sum(st.target_units) as target_units,
      sum(st.target_units * st.selling_price_per_unit) as target_revenue,
      (
        select count(*) from public.prospects p
        where p.sales_id = st.sales_id and p.status = 'closing' and p.closed_at is not null
          and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year
      ) as closing_units
    from public.sales_targets st
    join public.employees e on e.id = st.sales_id and e.deleted_at is null and e.employment_status = 'active'
    where st.period_month = v_month and st.period_year = v_year
    group by st.sales_id
    having sum(st.target_units) > 0
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_row.sales_id, 'crm', 'target_reminder', 'Progress Target Bulan Ini',
      'Closing ' || v_row.closing_units || ' dari ' || v_row.target_units || ' unit target ('
        || round(v_row.closing_units::numeric / v_row.target_units * 100, 1) || '%). Target Revenue Rp '
        || to_char(v_row.target_revenue, 'FM999,999,999,999') || '.',
      '/crm/dashboard'
    );
  end loop;
end;
$$;

select cron.schedule(
  'ai-sales-target-reminder-weekly',
  '0 1 * * 1', -- Monday 09:00 WITA (UTC+8)
  $$select public.ai_send_sales_target_reminders();$$
);

-- ----------------------------------------------------------------------------
-- WhatsApp relay: fans out a subset of mkc_notifications categories to
-- WhatsApp via app/api/ai/whatsapp-relay/route.ts, alongside the existing
-- web-push trigger (0054) — the two are independent and both fire on every
-- insert; the relay route itself decides per-notification whether the
-- recipient has a phone number on file. Same net.http_post + no-shared-
-- secret + re-fetch-by-id pattern as 0054_push_route_trigger.sql.
-- ----------------------------------------------------------------------------
create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category = any (array[
    -- Reminder Absen
    'attendance_reminder', 'late_attendance', 'forgot_checkout',
    -- Reminder Memo
    'new_memo',
    -- Reminder Target Sales
    'target_reminder',
    -- Reminder Markom
    'weekly_reminder', 'markom_new_task', 'task_revision',
    -- Reminder Payroll
    'payroll_available',
    -- Reminder Approval
    'waiting_approval',
    -- Reminder Project
    'project_progress', 'material_request', 'inspection_reminder'
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

create trigger mkc_notifications_after_insert_whatsapp
  after insert on public.mkc_notifications
  for each row execute function public.mkc_notifications_whatsapp_trigger();
