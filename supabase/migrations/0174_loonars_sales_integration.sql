-- ============================================================================
-- MK Connect — 0174: loonars-sales integration (inbound half)
--
-- loonars-sales is the digital siteplan for Loonars Villa where marketing
-- reps pick a block/unit and record a closing. It shares MKH Property's
-- Supabase project and already posts cash-in journal entries directly there
-- on closing (untouched by this migration — no double-booking of cash).
--
-- MKH Property's 0009_loonars_fee_integration.sql now sends two new
-- outbound events through the existing sync pipeline:
--
-- 1. loonars_fee_submitted    -> notify every super_admin (WhatsApp +
--    in-app), same mechanism as finance_expense_alert (0098).
-- 2. loonars_closing_approved -> match the marketing's phone number to an
--    `employees` row, then upsert a `prospects` record with
--    status='closing' tied to that sales_id/branch_id so the closing counts
--    toward the sales target the normal way (crm_sales_stats etc. already
--    read prospects.status='closing'). If the phone doesn't match any
--    employee, no target is touched — the event is only logged for manual
--    reconciliation, and super_admin still gets alerted.
--
-- No new secret/endpoint: extends the existing PostgREST-callable
-- public.sync_inbound() RPC (0058/0098), authenticated the same way
-- (X-Sync-Secret vs Vault's mk_sync_shared_secret).
-- ============================================================================

create table public.loonars_integration_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  fee_id text,
  phone text,
  matched_employee_id uuid references public.employees(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  status text not null check (status in ('matched', 'unmatched', 'error')),
  detail text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.loonars_integration_log enable row level security;

create policy "loonars_integration_log_select" on public.loonars_integration_log
  for select to authenticated
  using (public.app_has_permission('crm_analytics.view_all'));

comment on table public.loonars_integration_log is
  'Audit trail for loonars-sales -> MK Connect sync events (loonars_fee_submitted, loonars_closing_approved), especially phone-number match/no-match outcomes for manual reconciliation.';

-- ----------------------------------------------------------------------------
-- New notification category, piggybacking the existing WhatsApp relay
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
    -- This migration
    'loonars_fee_alert'
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
    -- This migration
    'loonars_fee_alert'
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
-- sync_inbound: handle the two new loonars-sales event types
-- ----------------------------------------------------------------------------
create or replace function public.sync_inbound(p_idempotency_key text, p_event_type text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
  v_provided text;
  v_sync_log_id uuid;
  v_target_ref text;
  v_mkc_payment_id uuid;
  v_admin record;
  v_branch_id uuid;
  v_employee record;
  v_phone_norm text;
  v_prospect_id uuid;
  v_city text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'mk_sync_shared_secret';
  v_provided := coalesce(
    current_setting('request.headers', true)::json ->> 'x-sync-secret',
    current_setting('request.header.x-sync-secret', true)
  );
  if v_secret is null or v_provided is distinct from v_secret then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload, status)
  values ('inbound', p_event_type, 'mkh_property', gen_random_uuid(), p_idempotency_key, p_payload, 'sent')
  on conflict (idempotency_key) do nothing
  returning id into v_sync_log_id;

  if v_sync_log_id is null then
    select target_ref into v_target_ref from public.sync_log where idempotency_key = p_idempotency_key;
    return jsonb_build_object('status', 'duplicate', 'target_ref', v_target_ref);
  end if;

  begin
    if p_event_type = 'finance_payment_confirmed' then
      v_mkc_payment_id := (p_payload ->> 'mkc_payment_id')::uuid;

      update public.prospect_payments set
        finance_confirmed_at = coalesce((p_payload ->> 'confirmed_at')::timestamptz, now()),
        finance_confirmed_by = coalesce(p_payload ->> 'confirmed_by', 'mkh_property'),
        finance_reference_no = p_payload ->> 'jurnal_no'
      where id = v_mkc_payment_id;

      if not found then
        raise exception 'prospect_payments % not found', v_mkc_payment_id;
      end if;

      v_target_ref := v_mkc_payment_id::text;

    elsif p_event_type = 'finance_expense_approved' then
      for v_admin in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_admin.id, 'system', 'finance_expense_alert',
          'Pengeluaran Disetujui — ' || coalesce(p_payload ->> 'proyek_nama', p_payload ->> 'proyek', '-'),
          'Rp ' || to_char(coalesce((p_payload ->> 'nominal')::numeric, 0), 'FM999,999,999,999')
            || ' — ' || coalesce(p_payload ->> 'keterangan', '-')
            || E'\nDiinput oleh: ' || coalesce(p_payload ->> 'admin_email', '-')
            || E'\nDisetujui oleh: ' || coalesce(p_payload ->> 'approved_by', '-'),
          '/hr/finance-sync',
          jsonb_build_object('pengajuan_id', p_payload ->> 'pengajuan_id', 'proyek', p_payload ->> 'proyek')
        );
      end loop;
      v_target_ref := p_payload ->> 'pengajuan_id';

    elsif p_event_type = 'finance_branch_balance_updated' then
      select id into v_branch_id from public.branches where lower(name) = lower(p_payload ->> 'branch_name') limit 1;
      if v_branch_id is null then
        raise exception 'Unmapped branch name "%": add it to MK Connect''s branches table before this balance can sync.',
          p_payload ->> 'branch_name';
      end if;

      insert into public.finance_branch_balances (branch_id, branch_name, saldo, synced_at)
      values (
        v_branch_id, p_payload ->> 'branch_name', coalesce((p_payload ->> 'saldo')::numeric, 0),
        coalesce((p_payload ->> 'as_of')::timestamptz, now())
      )
      on conflict (branch_id) do update set
        branch_name = excluded.branch_name,
        saldo = excluded.saldo,
        synced_at = excluded.synced_at,
        updated_at = now()
      where excluded.synced_at >= public.finance_branch_balances.synced_at;

      v_target_ref := v_branch_id::text;

    elsif p_event_type = 'loonars_fee_submitted' then
      for v_admin in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_admin.id, 'system', 'loonars_fee_alert',
          'Pengajuan Fee — Unit ' || coalesce(p_payload ->> 'unit', '-'),
          'Marketing ' || coalesce(p_payload ->> 'marketing', '-')
            || ' mengajukan fee closing unit ' || coalesce(p_payload ->> 'unit', '-')
            || ' (' || coalesce(p_payload ->> 'proyek', '-') || ')'
            || E'\nPembeli: ' || coalesce(p_payload ->> 'buyer', '-')
            || E'\nNilai fee: Rp ' || to_char(coalesce((p_payload ->> 'fee_amount')::numeric, 0), 'FM999,999,999,999'),
          '/hr/finance-sync',
          jsonb_build_object('fee_id', p_payload ->> 'fee_id', 'proyek', p_payload ->> 'proyek')
        );
      end loop;
      v_target_ref := p_payload ->> 'fee_id';

    elsif p_event_type = 'loonars_closing_approved' then
      v_phone_norm := regexp_replace(coalesce(p_payload ->> 'phone', ''), '[^0-9]', '', 'g');

      if v_phone_norm = '' then
        insert into public.loonars_integration_log (event_type, fee_id, phone, status, detail, payload)
        values ('loonars_closing_approved', p_payload ->> 'fee_id', p_payload ->> 'phone', 'error',
          'Empty/invalid phone in payload', p_payload);
        v_target_ref := null;
      else
        select e.id, e.branch_id, b.name as branch_name into v_employee
        from public.employees e
        join public.branches b on b.id = e.branch_id
        where regexp_replace(e.phone, '[^0-9]', '', 'g') = v_phone_norm
          and e.deleted_at is null and e.employment_status = 'active'
        limit 1;

        if v_employee.id is null then
          insert into public.loonars_integration_log (event_type, fee_id, phone, status, detail, payload)
          values ('loonars_closing_approved', p_payload ->> 'fee_id', p_payload ->> 'phone', 'unmatched',
            'No active employee matches this phone number', p_payload);
          v_target_ref := null;
        else
          v_city := coalesce(v_employee.branch_name, 'N/A');

          insert into public.prospects (
            customer_name, phone, house_type, city, lead_source, status,
            sales_id, branch_id, closed_at, notes, created_by, updated_by
          )
          values (
            coalesce(p_payload ->> 'buyer', 'Closing Loonars Villa'),
            p_payload ->> 'phone',
            coalesce(p_payload ->> 'unit', '-'),
            v_city,
            'other',
            'closing',
            v_employee.id, v_employee.branch_id, now(),
            'Auto-synced from loonars-sales. Proyek: ' || coalesce(p_payload ->> 'proyek', '-')
              || ', Unit: ' || coalesce(p_payload ->> 'unit', '-')
              || ', Harga: ' || coalesce(p_payload ->> 'price', '0'),
            null, null
          )
          on conflict (phone_normalized) where deleted_at is null do update set
            status = 'closing',
            sales_id = excluded.sales_id,
            branch_id = excluded.branch_id,
            closed_at = excluded.closed_at,
            notes = excluded.notes,
            updated_at = now()
          returning id into v_prospect_id;

          insert into public.loonars_integration_log
            (event_type, fee_id, phone, matched_employee_id, prospect_id, status, payload)
          values (
            'loonars_closing_approved', p_payload ->> 'fee_id', p_payload ->> 'phone',
            v_employee.id, v_prospect_id, 'matched', p_payload
          );
          v_target_ref := v_prospect_id::text;
        end if;
      end if;

    else
      update public.sync_log set status = 'skipped', last_error = 'Unknown event_type: ' || p_event_type, updated_at = now()
        where id = v_sync_log_id;
      return jsonb_build_object('status', 'skipped');
    end if;

    update public.sync_log set status = 'succeeded', target_ref = v_target_ref, updated_at = now() where id = v_sync_log_id;
    return jsonb_build_object('status', 'ok', 'target_ref', v_target_ref);
  exception when others then
    update public.sync_log set status = 'failed', last_error = left(sqlerrm, 2000), updated_at = now() where id = v_sync_log_id;
    raise;
  end;
end;
$$;

comment on function public.sync_inbound is
  'PostgREST-callable receiver for MKH Property -> MK Connect sync events (finance_payment_confirmed, finance_expense_approved, finance_branch_balance_updated, loonars_fee_submitted, loonars_closing_approved). Authenticated via X-Sync-Secret header against Supabase Vault, not JWT.';
