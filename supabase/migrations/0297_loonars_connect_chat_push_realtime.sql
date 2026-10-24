-- ============================================================================
-- MK Connect — 0297: Loonars Connect, WhatsApp-style chat push + realtime
--
-- Owner's request (2026-10-24): chat notifications like WhatsApp, and the
-- Markom/Sales live report truly realtime.
--
-- 1. Chat push. Every message a PERSON sends in an operational group (text,
--    photo, or a card they created) becomes a 'chat_message' notification for
--    the group's other active members. The existing mkc_notifications push
--    trigger (/api/push/send) delivers it to their phones; the route and the
--    service worker show it WhatsApp-style (sender · group as title, message
--    as body, one stacked notification per conversation, unread badge on the
--    app icon). The rows are stored 'archived' so chat does not flood the bell
--    (the bell lists non-archived, counts 'unread'); chat has its own unread
--    counts. 'chat_message' is not on the WhatsApp-relay allowlist, so no
--    WhatsApp message is sent. The trigger is deferred to commit and skips a
--    recipient who already got a workflow notification in the same
--    transaction (e.g. FO handed a room for inspection), so nobody gets two
--    pushes for one event. Errors are caught: a push problem never blocks a
--    chat message.
-- 2. Realtime for the live report + groups. A one-row-per-department pulse
--    table (in the realtime publication, readable like the department) is
--    bumped by deferred, error-safe triggers on CRM leads / follow-ups,
--    Loonars 2 bookings, sales visits / daily reports and KOL-voucher villa
--    bookings. The same triggers run the Sales / KOL group sync, so a new lead
--    or a KOL check-in reaches the group at once instead of within 10 minutes.
--    The 10-minute cron stays as the safety net.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Notification category (live constraint as of 0291 + chat_message)
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
    'refund_reminder', 'refund_customer_message',
    -- Loonars Connect Hospitality (0291)
    'hospitality_task', 'hospitality_report', 'hospitality_critical_alert',
    -- Loonars Connect chat (0297)
    'chat_message'
  ]));

-- ----------------------------------------------------------------------------
-- 1. Chat push
-- ----------------------------------------------------------------------------
create or replace function public.mkc_chat_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv record;
  v_sender text;
  v_preview text;
begin
  if new.sender_id is null then
    return null;
  end if;
  begin
    select c.id, c.kind, c.name into v_conv from public.mkc_chat_conversations c where c.id = new.conversation_id;
    if v_conv.kind is distinct from 'operational_group' then
      return null;
    end if;
    select full_name into v_sender from public.employees where id = new.sender_id;
    v_preview := case
      when new.kind = 'text' then coalesce(nullif(trim(new.body), ''),
        case when exists (select 1 from public.mkc_chat_attachments a where a.message_id = new.id) then '📷 Foto' else 'Pesan baru' end)
      else coalesce(nullif(trim(new.body), ''), 'Pembaruan baru')
    end;
    insert into public.mkc_notifications (user_id, type, title, body, link, category, metadata, status, is_read)
    select m.employee_id, 'system',
           left(coalesce(v_sender, 'Anggota') || ' · ' || v_conv.name, 200),
           left(v_preview, 300),
           '/chat?c=' || new.conversation_id,
           'chat_message',
           jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'sender_id', new.sender_id),
           'archived', true
    from public.mkc_chat_members m
    where m.conversation_id = new.conversation_id
      and m.removed_at is null
      and m.employee_id <> new.sender_id
      and public.mkc_chat_employee_eligible(m.employee_id)
      -- already told about this event by a workflow notification in this transaction
      and not exists (select 1 from public.mkc_notifications n
                      where n.user_id = m.employee_id and n.created_at = now() and n.category is distinct from 'chat_message');
  exception when others then
    raise warning 'Loonars Connect chat push skipped (message kept): %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.mkc_chat_message_notify() from public, anon, authenticated;

create constraint trigger mkc_chat_messages_notify
  after insert on public.mkc_chat_messages
  deferrable initially deferred
  for each row
  when (new.sender_id is not null)
  execute function public.mkc_chat_message_notify();

-- Unread chat messages across a person's conversations: the app-icon badge
-- sent with each chat push (service role only, called by /api/push/send).
create or replace function public.mkc_chat_unread_total(p_employee_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.mkc_chat_conversations c
  join public.mkc_chat_messages m on m.conversation_id = c.id
  left join public.mkc_chat_reads r on r.conversation_id = c.id and r.employee_id = p_employee_id
  where (exists (select 1 from public.mkc_chat_members cm
                 where cm.conversation_id = c.id and cm.employee_id = p_employee_id and cm.removed_at is null)
         or (c.kind = 'owner_feed' and p_employee_id = any (public.mkc_hosp_owner_ids())))
    and m.sender_id is distinct from p_employee_id
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
$$;

revoke execute on function public.mkc_chat_unread_total(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Realtime pulse + instant Sales / KOL sync
-- ----------------------------------------------------------------------------
create table public.mkc_connect_pulse (
  department_id uuid primary key references public.mkc_chat_departments(id) on delete cascade,
  changed_at timestamptz not null default now()
);
alter table public.mkc_connect_pulse enable row level security;
create policy mkc_connect_pulse_select on public.mkc_connect_pulse for select using (public.mkc_hosp_can_view_department(department_id));
alter publication supabase_realtime add table public.mkc_connect_pulse;

create or replace function public.mkc_connect_pulse_bump(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.mkc_connect_pulse (department_id, changed_at)
  select id, now() from public.mkc_chat_departments where code = p_code
  on conflict (department_id) do update set changed_at = excluded.changed_at
$$;

revoke execute on function public.mkc_connect_pulse_bump(text) from public, anon, authenticated;

-- TG_ARGV[0]: 'sales' (CRM / Loonars 2 / visits / daily reports) or 'kol' (villa bookings).
create or replace function public.mkc_connect_source_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_argv[0] = 'kol' then
      perform pg_advisory_xact_lock(hashtext('mkc_mkt_sync_kol'));
      perform public.mkc_mkt_sync_kol();
      perform public.mkc_connect_pulse_bump('markom_jogja');
    else
      perform pg_advisory_xact_lock(hashtext('mkc_sales_sync'));
      perform public.mkc_sales_sync();
      perform public.mkc_connect_pulse_bump('sales_jogja');
    end if;
  exception when others then
    raise warning 'Loonars Connect realtime sync skipped (write kept): %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.mkc_connect_source_trigger() from public, anon, authenticated;

create constraint trigger mkc_connect_on_prospect_insert
  after insert on public.prospects deferrable initially deferred
  for each row execute function public.mkc_connect_source_trigger('sales');
create constraint trigger mkc_connect_on_prospect_update
  after update of status, sales_id, last_follow_up_at, lead_temperature on public.prospects deferrable initially deferred
  for each row execute function public.mkc_connect_source_trigger('sales');
create constraint trigger mkc_connect_on_follow_up
  after insert on public.prospect_follow_ups deferrable initially deferred
  for each row execute function public.mkc_connect_source_trigger('sales');
create constraint trigger mkc_connect_on_purchase
  after insert or update of status on public.loonars_unit_purchases deferrable initially deferred
  for each row execute function public.mkc_connect_source_trigger('sales');
create constraint trigger mkc_connect_on_sales_visit
  after insert or update of status on public.mkc_sales_visits deferrable initially deferred
  for each row execute function public.mkc_connect_source_trigger('sales');
create constraint trigger mkc_connect_on_daily_report
  after insert on public.mkc_sales_daily_reports deferrable initially deferred
  for each row execute function public.mkc_connect_source_trigger('sales');
create constraint trigger mkc_connect_on_kol_booking
  after insert or update of status on public.bookings deferrable initially deferred
  for each row when (new.kol_voucher_id is not null)
  execute function public.mkc_connect_source_trigger('kol');

-- Markom calendar / KOL changes are already in the realtime publication; bump
-- the pulse too so the live report has one signal to follow.
create or replace function public.mkc_connect_markom_pulse_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.mkc_connect_pulse_bump('markom_jogja');
  exception when others then
    raise warning 'Loonars Connect pulse skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.mkc_connect_markom_pulse_trigger() from public, anon, authenticated;

create constraint trigger mkc_connect_on_content_plan
  after insert or update on public.mkc_mkt_content_plans deferrable initially deferred
  for each row execute function public.mkc_connect_markom_pulse_trigger();
create constraint trigger mkc_connect_on_kol_collab
  after insert or update on public.mkc_mkt_kol_collabs deferrable initially deferred
  for each row execute function public.mkc_connect_markom_pulse_trigger();

insert into public.mkc_connect_pulse (department_id)
select id from public.mkc_chat_departments where code in ('markom_jogja', 'sales_jogja')
on conflict do nothing;
