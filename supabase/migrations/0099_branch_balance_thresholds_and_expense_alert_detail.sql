-- ============================================================================
-- MK Connect — 0099: Real per-branch balance thresholds + richer expense
-- alert detail
--
-- 1. Replaces the placeholder Rp 15.000.000 flat threshold with each
--    branch's actual monthly payroll/operating cost (given by CFO):
--    Jogja 26jt, Makassar 35jt, Jabodetabek 65jt, Kendari 1.5jt. Jabodetabek
--    additionally notifies Direktur Operasional, not just Kepala Cabang.
-- 2. finance_expense_approved's WhatsApp body to super_admin now shows item
--    bought, nilai, and keterangan (which is where the admin normally types
--    the destination bank account number) as distinct labeled lines instead
--    of one paragraph.
-- ============================================================================

alter table public.finance_branch_balances
  add column alert_threshold numeric not null default 15000000,
  add column notify_dirops boolean not null default false;

comment on column public.finance_branch_balances.alert_threshold is
  'Monthly payroll/operating cost for this branch -- the AI balance advisory fires when saldo drops below this.';
comment on column public.finance_branch_balances.notify_dirops is
  'When true, the AI balance advisory also notifies Direktur Operasional, not just this branch''s Kepala Cabang.';

update public.finance_branch_balances set alert_threshold = 26000000 where branch_name = 'Jogja';
update public.finance_branch_balances set alert_threshold = 35000000 where branch_name = 'Makassar';
update public.finance_branch_balances set alert_threshold = 65000000, notify_dirops = true where branch_name = 'Jabodetabek';
update public.finance_branch_balances set alert_threshold = 1500000 where branch_name = 'Kendari';

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
