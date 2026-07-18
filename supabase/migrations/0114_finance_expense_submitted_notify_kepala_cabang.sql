-- ============================================================================
-- MK Connect — 0114: Two-stage expense approval WhatsApp flow
--
-- Previously admin-submitted pengajuan (bahan/tukang) in mkh-properti only
-- notified via Telegram, and MK Connect only ever heard about it once
-- already approved (finance_expense_approved -> super_admin). Per owner's
-- request: admin submits -> WhatsApp to that branch's Kepala Cabang with
-- the verification link (new finance_expense_submitted event, mkh-properti
-- migration 0008) -> Kepala Cabang approves in mkh-properti's
-- verifikasi.html -> WhatsApp to super_admin (finance_expense_approved,
-- already existed, unchanged).
-- ============================================================================

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
    -- This migration
    'finance_expense_pending_verification'
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
    -- This migration
    'finance_expense_pending_verification'
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

    elsif p_event_type = 'finance_expense_submitted' then
      select id into v_branch_id from public.branches where lower(name) = lower(p_payload ->> 'branch_name') limit 1;
      if v_branch_id is not null then
        for v_admin in
          select em.id from public.employees em
          join public.roles r on r.id = em.role_id
          where em.branch_id = v_branch_id and em.deleted_at is null and em.employment_status = 'active' and r.key = 'kepala_cabang'
        loop
          insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
          values (
            v_admin.id, 'system', 'finance_expense_pending_verification',
            'Pengajuan Baru Menunggu Verifikasi — ' || coalesce(p_payload ->> 'proyek_nama', p_payload ->> 'proyek', '-'),
            '🧾 Item: ' || coalesce(p_payload ->> 'item', '-')
              || case when coalesce(p_payload ->> 'supplier', '') <> '' then ' (' || (p_payload ->> 'supplier') || ')' else '' end
              || E'\n💰 Nilai: Rp ' || to_char(coalesce((p_payload ->> 'nominal')::numeric, 0), 'FM999,999,999,999')
              || E'\n📝 Keterangan: ' || coalesce(p_payload ->> 'keterangan', '-')
              || E'\n👤 Diinput oleh: ' || coalesce(p_payload ->> 'admin_email', '-')
              || E'\n\n🔗 Verifikasi di sini: ' || coalesce(p_payload ->> 'verification_link', 'https://finance.haluoleo.id/verifikasi.html'),
            coalesce(p_payload ->> 'verification_link', 'https://finance.haluoleo.id/verifikasi.html'),
            jsonb_build_object('pengajuan_id', p_payload ->> 'pengajuan_id', 'proyek', p_payload ->> 'proyek')
          );
        end loop;
      end if;
      v_target_ref := p_payload ->> 'pengajuan_id';

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
          '🧾 Item: ' || coalesce(p_payload ->> 'item', '-')
            || case when coalesce(p_payload ->> 'supplier', '') <> '' then ' (' || (p_payload ->> 'supplier') || ')' else '' end
            || E'\n💰 Nilai: Rp ' || to_char(coalesce((p_payload ->> 'nominal')::numeric, 0), 'FM999,999,999,999')
            || E'\n📝 Keterangan: ' || coalesce(p_payload ->> 'keterangan', '-')
            || E'\n👤 Diinput oleh: ' || coalesce(p_payload ->> 'admin_email', '-')
            || E'\n✅ Disetujui oleh: ' || coalesce(p_payload ->> 'approved_by', '-'),
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
  'PostgREST-callable receiver for MKH Property -> MK Connect sync events (finance_payment_confirmed, finance_expense_submitted, finance_expense_approved, finance_branch_balance_updated). Authenticated via X-Sync-Secret header against Supabase Vault, not JWT.';
