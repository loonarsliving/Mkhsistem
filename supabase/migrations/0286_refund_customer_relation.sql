-- ============================================================================
-- MK Connect — 0286: Refund & Customer Relation module (/refund)
--
-- Owner's ask (2026-10-14): a dedicated module + dedicated login for the
-- "Refund & Customer Relation" job, built around the CS refund spreadsheet
-- (customer, refund amount, already paid, bank account, monthly termin
-- schedule). The officer:
--   1. ticks off each monthly termin once it is paid,
--   2. chats with the customer over WhatsApp from the dashboard (outbound
--      through the company's Whacenter device; the customer's replies are
--      captured by the WA webhook -- see lib/refund/inbound.ts),
--   3. reminds the owner (every Super Admin) and Vando about a refund with
--      one click -- delivered in-app AND over WhatsApp,
--   4. does their own attendance (existing /attendance, attendance.view_own).
--
-- Tables are mkc_-prefixed: this Supabase project is shared with the villa
-- app, and "refund" is exactly the kind of name a rental app would also use.
--
-- Customer data (names, phone numbers, bank accounts) is deliberately NOT in
-- this migration -- the repo is public. It is loaded directly against the
-- live database, same boundary as employee credentials (README "Keamanan").
--
-- "Terbayar" for a customer = opening_paid_amount (paid before / outside the
-- termin schedule) + the sum of termin rows ticked as paid. Sisa = refund
-- amount - terbayar. Computed in app code (repositories/refund.repository.ts),
-- never stored, so ticking a box can't leave a stale total behind.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table public.mkc_refund_customers (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(trim(customer_name)) > 0),
  phone text,
  refund_amount numeric(16, 2) not null check (refund_amount >= 0),
  opening_paid_amount numeric(16, 2) not null default 0 check (opening_paid_amount >= 0),
  bank_name text,
  bank_account_number text,
  bank_account_holder text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id),
  updated_by uuid references public.employees(id),
  deleted_at timestamptz
);

create index mkc_refund_customers_active_idx on public.mkc_refund_customers (sort_order) where deleted_at is null;

create table public.mkc_refund_installments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.mkc_refund_customers(id) on delete cascade,
  -- Always the 1st of the month: a termin is "the payment for Okt-26", not a
  -- specific day.
  due_month date not null check (extract(day from due_month) = 1),
  amount numeric(16, 2) not null check (amount > 0),
  is_paid boolean not null default false,
  paid_at timestamptz,
  paid_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, due_month)
);

create index mkc_refund_installments_month_idx on public.mkc_refund_installments (due_month);

create table public.mkc_refund_chat_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.mkc_refund_customers(id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  body text not null,
  -- outbound: who typed it. inbound: null (the customer).
  sent_by uuid references public.employees(id),
  delivery_status text not null default 'sent' check (delivery_status in ('sent', 'failed', 'received')),
  error text,
  -- inbound only: when a Refund & CR officer opened the conversation.
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index mkc_refund_chat_messages_customer_idx on public.mkc_refund_chat_messages (customer_id, created_at);
create index mkc_refund_chat_messages_unread_idx on public.mkc_refund_chat_messages (customer_id) where direction = 'inbound' and read_at is null;

create table public.mkc_refund_reminders (
  id uuid primary key default gen_random_uuid(),
  -- null = the "all termin due this month" summary reminder.
  customer_id uuid references public.mkc_refund_customers(id) on delete cascade,
  note text,
  recipient_count integer not null default 0,
  sent_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create index mkc_refund_reminders_customer_idx on public.mkc_refund_reminders (customer_id, created_at desc);

create trigger set_updated_at before update on public.mkc_refund_customers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.mkc_refund_installments
  for each row execute function public.set_updated_at();

alter table public.mkc_refund_customers enable row level security;
alter table public.mkc_refund_installments enable row level security;
alter table public.mkc_refund_chat_messages enable row level security;
alter table public.mkc_refund_reminders enable row level security;

-- ----------------------------------------------------------------------------
-- Permissions + role
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('refund.view', 'View the customer refund module (refund data, termin schedule, chat history)'),
  ('refund.manage', 'Manage customer refunds: tick paid termin, edit refund data, chat customers over WhatsApp, send reminders to the owner and Vando')
on conflict (key) do nothing;

insert into public.roles (key, name, level, description, is_system) values
  ('refund_customer_relation', 'Refund & Customer Relation', 60,
   'Handles customer refunds only: the /refund module (termin, WhatsApp chat with customers, reminders to the owner/Vando) plus their own attendance', true)
on conflict (key) do nothing;

-- "Login hanya untuk ini": the role gets the refund module and its own
-- attendance -- nothing else. dashboard.view is kept only because every real
-- role must hold it (tests/unit/constants/rbac.test.ts); /dashboard itself
-- redirects this role straight to /refund, so the landing page is the module.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'refund.view', 'refund.manage', 'attendance.view_own'
) where r.key = 'refund_customer_relation'
on conflict do nothing;

-- super_admin holds every permission by definition.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('refund.view', 'refund.manage')
where r.key = 'super_admin'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
create policy mkc_refund_customers_select on public.mkc_refund_customers for select
  using (public.app_has_permission('refund.view') or public.app_has_permission('refund.manage'));
create policy mkc_refund_customers_insert on public.mkc_refund_customers for insert
  with check (public.app_has_permission('refund.manage'));
create policy mkc_refund_customers_update on public.mkc_refund_customers for update
  using (public.app_has_permission('refund.manage'))
  with check (public.app_has_permission('refund.manage'));

create policy mkc_refund_installments_select on public.mkc_refund_installments for select
  using (public.app_has_permission('refund.view') or public.app_has_permission('refund.manage'));
create policy mkc_refund_installments_insert on public.mkc_refund_installments for insert
  with check (public.app_has_permission('refund.manage'));
-- Ticking paid goes through refund_set_installment_paid() so paid_by/paid_at
-- are always set server-side; this policy covers editing amount/month.
create policy mkc_refund_installments_update on public.mkc_refund_installments for update
  using (public.app_has_permission('refund.manage'))
  with check (public.app_has_permission('refund.manage'));
create policy mkc_refund_installments_delete on public.mkc_refund_installments for delete
  using (public.app_has_permission('refund.manage') and not is_paid);

create policy mkc_refund_chat_messages_select on public.mkc_refund_chat_messages for select
  using (public.app_has_permission('refund.view') or public.app_has_permission('refund.manage'));
-- Only an officer's own outbound message; inbound rows are written by the
-- WA webhook with the service role.
create policy mkc_refund_chat_messages_insert on public.mkc_refund_chat_messages for insert
  with check (public.app_has_permission('refund.manage') and direction = 'outbound' and sent_by = auth.uid());
create policy mkc_refund_chat_messages_update on public.mkc_refund_chat_messages for update
  using (public.app_has_permission('refund.manage'))
  with check (public.app_has_permission('refund.manage'));

create policy mkc_refund_reminders_select on public.mkc_refund_reminders for select
  using (public.app_has_permission('refund.view') or public.app_has_permission('refund.manage'));
-- No insert policy: written only by refund_send_reminder().

-- ----------------------------------------------------------------------------
-- Notification categories. Restated from the LIVE constraint (which already
-- includes everything up to occupancy_campaign_*), plus this migration's two.
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
    'construction_expense_submitted', 'construction_weekly_report', 'material_purchase_missing_photo',
    'construction_progress_report', 'approval_request_submitted', 'approval_request_decided',
    'lead_hot_handoff', 'pending_question_timeout',
    'construction_cost_request_submitted', 'construction_cost_request_decided', 'construction_project_weekly_report',
    'occupancy_campaign_launched', 'occupancy_campaign_failed',
    -- This migration
    'refund_reminder', 'refund_customer_message'
  ]));

-- WhatsApp relay allowlist. Restated VERBATIM from the live function (0276's
-- version -- see 0189's warning about restating a stale body) plus
-- refund_reminder: a refund owed to a customer is a finance matter, and the
-- whole point of the button is that the owner and Vando actually hear it.
-- refund_customer_message stays in-app only (it goes to the officer, who is
-- already looking at the dashboard).
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
    -- Refund customer -- pengingat dari Refund & Customer Relation (0286).
    'refund_reminder',
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

-- ----------------------------------------------------------------------------
-- refund_set_installment_paid(): the checkbox. paid_by/paid_at set here so
-- the audit trail can't be forged from the client.
-- ----------------------------------------------------------------------------
create or replace function public.refund_set_installment_paid(p_installment_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('refund.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.mkc_refund_installments
    set is_paid = p_paid,
        paid_at = case when p_paid then now() else null end,
        paid_by = case when p_paid then auth.uid() else null end
    where id = p_installment_id;

  if not found then
    raise exception 'Termin tidak ditemukan';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- refund_send_reminder(): the "Ingatkan Owner & Vando" button.
--   p_customer_id given -> reminder about that one customer (sisa, overdue
--                          termin, this month's termin, rekening).
--   p_customer_id null  -> summary of every unpaid termin due up to and
--                          including the current month.
-- Recipients: every active Super Admin + Vando (matched by name, same
-- convention as 0257/0258). Returns the number of recipients notified.
-- "Bulan ini" is evaluated in WITA (Asia/Makassar).
-- ----------------------------------------------------------------------------
create or replace function public.refund_send_reminder(p_customer_id uuid default null, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_name text;
  v_month date := date_trunc('month', (now() at time zone 'Asia/Makassar'))::date;
  v_customer public.mkc_refund_customers%rowtype;
  v_paid numeric;
  v_sisa numeric;
  v_title text;
  v_body text;
  v_lines text := '';
  v_total numeric := 0;
  v_row record;
  v_recipient record;
  v_count integer := 0;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.app_has_permission('refund.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  -- Double-click / spam guard: same target within 5 minutes.
  if exists (
    select 1 from public.mkc_refund_reminders
    where customer_id is not distinct from p_customer_id and created_at > now() - interval '5 minutes'
  ) then
    raise exception 'Pengingat ini baru saja dikirim. Tunggu 5 menit sebelum mengirim lagi.';
  end if;

  select full_name into v_caller_name from public.employees where id = v_caller;

  if p_customer_id is not null then
    select * into v_customer from public.mkc_refund_customers where id = p_customer_id and deleted_at is null;
    if not found then
      raise exception 'Customer refund tidak ditemukan';
    end if;

    select v_customer.opening_paid_amount + coalesce(sum(amount) filter (where is_paid), 0)
      into v_paid from public.mkc_refund_installments where customer_id = p_customer_id;
    v_sisa := greatest(v_customer.refund_amount - v_paid, 0);

    for v_row in
      select due_month, amount from public.mkc_refund_installments
      where customer_id = p_customer_id and not is_paid and due_month <= v_month
      order by due_month
    loop
      v_lines := v_lines || E'\n• ' || to_char(v_row.due_month, 'MM/YYYY') || ': Rp ' || to_char(v_row.amount, 'FM999,999,999,999')
        || case when v_row.due_month < v_month then ' (TERLAMBAT)' else ' (bulan ini)' end;
      v_total := v_total + v_row.amount;
    end loop;

    v_title := 'Pengingat Refund — ' || v_customer.customer_name;
    v_body := '👤 Customer: ' || v_customer.customer_name
      || coalesce(E'\n📱 ' || nullif(trim(v_customer.phone), ''), '')
      || E'\n💰 Total refund: Rp ' || to_char(v_customer.refund_amount, 'FM999,999,999,999')
      || E'\n✅ Terbayar: Rp ' || to_char(v_paid, 'FM999,999,999,999')
      || E'\n⏳ Sisa: Rp ' || to_char(v_sisa, 'FM999,999,999,999')
      || case when v_total > 0
           then E'\n\n📅 Termin harus dibayar:' || v_lines || E'\nTotal: Rp ' || to_char(v_total, 'FM999,999,999,999')
           else E'\n\n📅 Tidak ada termin jatuh tempo s.d. bulan ini.' end
      || case when coalesce(trim(v_customer.bank_account_number), '') <> ''
           then E'\n\n🏦 Rekening: ' || coalesce(nullif(trim(v_customer.bank_name), ''), '-') || ' ' || trim(v_customer.bank_account_number)
                || coalesce(' a.n. ' || nullif(trim(v_customer.bank_account_holder), ''), '')
           else E'\n\n🏦 Rekening: belum ada data' end;
  else
    for v_row in
      select c.customer_name, i.due_month, i.amount
      from public.mkc_refund_installments i
      join public.mkc_refund_customers c on c.id = i.customer_id and c.deleted_at is null
      where not i.is_paid and i.due_month <= v_month
      order by i.due_month, c.sort_order, c.customer_name
    loop
      v_lines := v_lines || E'\n• ' || v_row.customer_name || ' — Rp ' || to_char(v_row.amount, 'FM999,999,999,999')
        || case when v_row.due_month < v_month then ' (TERLAMBAT ' || to_char(v_row.due_month, 'MM/YYYY') || ')' else '' end;
      v_total := v_total + v_row.amount;
    end loop;

    v_title := 'Pengingat Refund — Termin ' || to_char(v_month, 'MM/YYYY');
    v_body := case when v_total > 0
      then '📅 Termin refund yang belum dibayar s.d. bulan ini:' || v_lines
           || E'\n\n💰 Total: Rp ' || to_char(v_total, 'FM999,999,999,999')
      else '📅 Semua termin refund s.d. bulan ini sudah dibayar.' end;
  end if;

  v_body := v_body
    || coalesce(E'\n\n📝 Catatan: ' || v_note, '')
    || E'\n\n— diingatkan oleh ' || coalesce(v_caller_name, 'Refund & Customer Relation');

  for v_recipient in
    select distinct em.id from public.employees em
    left join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active'
      and (r.key = 'super_admin' or em.full_name ilike '%vando%')
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_recipient.id, 'system', 'refund_reminder', v_title, v_body, '/refund',
      jsonb_build_object('refund_customer_id', p_customer_id, 'sent_by', v_caller)
    );
    v_count := v_count + 1;
  end loop;

  insert into public.mkc_refund_reminders (customer_id, note, recipient_count, sent_by)
  values (p_customer_id, v_note, v_count, v_caller);

  return v_count;
end;
$$;

revoke all on function public.refund_set_installment_paid(uuid, boolean) from public, anon;
revoke all on function public.refund_send_reminder(uuid, text) from public, anon;
grant execute on function public.refund_set_installment_paid(uuid, boolean) to authenticated;
grant execute on function public.refund_send_reminder(uuid, text) to authenticated;
