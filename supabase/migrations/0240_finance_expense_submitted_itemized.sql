-- ============================================================================
-- MK Connect — 0240: Itemize Vando's "Pengajuan Baru Menunggu Verifikasi" alert
--
-- Owner's feedback: the WhatsApp alert Kepala Cabang gets when a bahan/
-- tukang pengajuan is submitted only ever showed one combined item
-- description, even for pengajuan whose data.items already carries a real
-- per-line breakdown (nota photos, and Anang's own WhatsApp fund
-- requests). mkh-properti's pengajuan_expense_submitted_sync trigger now
-- forwards that array (see mkh-properti migration 0030); this just makes
-- the notification body list each line with its own value when it's
-- present, instead of the single combined "Item: ..." line. Falls back to
-- the old single-line rendering when items is absent/empty (manual
-- lapor-pengeluaran.html submissions with a single item, or any older
-- pengajuan still in flight). Every other branch of sync_inbound is
-- unchanged (CREATE OR REPLACE needs the full body).
-- ============================================================================

create or replace function public.sync_inbound(p_idempotency_key text, p_event_type text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $function$
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
  v_closing_id uuid;
  v_sender record;
  v_has_recent_photo boolean;
  v_items jsonb;
  v_item_row jsonb;
  v_items_text text;
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
      v_items := p_payload -> 'items';
      v_items_text := null;
      if v_items is not null and jsonb_typeof(v_items) = 'array' and jsonb_array_length(v_items) > 0 then
        v_items_text := '';
        for v_item_row in select * from jsonb_array_elements(v_items)
        loop
          v_items_text := v_items_text || E'\n🧾 ' || coalesce(v_item_row ->> 'nama', '-')
            || ' - Rp ' || to_char(coalesce((v_item_row ->> 'nilai')::numeric, 0), 'FM999,999,999,999');
        end loop;
        v_items_text := ltrim(v_items_text, E'\n');
      end if;

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
            coalesce(v_items_text, '🧾 Item: ' || coalesce(p_payload ->> 'item', '-'))
              || case when coalesce(p_payload ->> 'supplier', '') <> '' then ' (' || (p_payload ->> 'supplier') || ')' else '' end
              || E'\n💰 Nilai Diajukan: Rp ' || to_char(coalesce((p_payload ->> 'nominal')::numeric, 0), 'FM999,999,999,999')
              || case when p_payload ->> 'tipe' = 'tukang' and p_payload ->> 'sisa_kontrak' is not null then
                   E'\n✅ Total Terbayar (termasuk ini): Rp ' || to_char(coalesce((p_payload ->> 'terbayar_baru')::numeric, 0), 'FM999,999,999,999')
                   || E'\n📉 Sisa Kontrak Setelah Ini: Rp ' || to_char(coalesce((p_payload ->> 'sisa_kontrak')::numeric, 0), 'FM999,999,999,999')
                 else '' end
              || E'\n📝 Keterangan: ' || coalesce(p_payload ->> 'keterangan', '-')
              || E'\n👤 Diinput oleh: ' || coalesce(p_payload ->> 'admin_email', '-')
              || E'\n\n🔗 Verifikasi di sini: ' || coalesce(p_payload ->> 'verification_link', 'https://finance.haluoleo.id/verifikasi.html'),
            coalesce(p_payload ->> 'verification_link', 'https://finance.haluoleo.id/verifikasi.html'),
            jsonb_build_object(
              'pengajuan_id', p_payload ->> 'pengajuan_id', 'proyek', p_payload ->> 'proyek',
              'tipe', p_payload ->> 'tipe', 'branch_id', v_branch_id,
              'tukang_nama', p_payload ->> 'item', 'nominal', p_payload ->> 'nominal',
              'sisa_kontrak', p_payload ->> 'sisa_kontrak', 'terbayar_baru', p_payload ->> 'terbayar_baru'
            )
          );
        end loop;
      end if;

      if p_payload ->> 'tipe' = 'bahan' and coalesce(p_payload ->> 'admin_email', '') ilike '%endy%' then
        select em.id, em.full_name into v_sender
        from public.employees em
        where em.full_name ilike '%endy%' and em.deleted_at is null and em.employment_status = 'active'
        limit 1;

        if v_sender.id is not null then
          select exists(
            select 1 from public.photo_auto_forward_log
            where employee_id = v_sender.id and created_at >= now() - interval '2 hours'
          ) into v_has_recent_photo;

          if not v_has_recent_photo then
            insert into public.mkc_notifications (user_id, type, category, title, body, metadata)
            values (
              v_sender.id, 'system', 'material_purchase_missing_photo',
              'Konfirmasi Pemesanan Bahan',
              '🧾 Anda mengajukan pembelian: ' || coalesce(p_payload ->> 'item', '-')
                || E'\n💰 Nilai: Rp ' || to_char(coalesce((p_payload ->> 'nominal')::numeric, 0), 'FM999,999,999,999')
                || E'\n\n📸 Belum ada foto bahan yang diterima sebagai bukti/alasan pemesanan ini.'
                || E'\n\n❓ Bahan ini untuk pengerjaan apa, dan di blok berapa? Balas pesan ini, dan kirimkan juga foto bahannya ya.',
              jsonb_build_object('pengajuan_id', p_payload ->> 'pengajuan_id', 'proyek', p_payload ->> 'proyek')
            );
          end if;
        end if;
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
            || E'\n✅ Disetujui oleh: ' || coalesce(p_payload ->> 'approved_by', '-')
            || case when coalesce(p_payload ->> 'no', '') <> '' then E'\n🆔 Kode: ' || (p_payload ->> 'no') else '' end
            || E'\n\n💸 Setelah transfer, kirim foto bukti transfer ke WhatsApp ini -- akan otomatis dibaca AI, dicatat ke jurnal, dan diteruskan ke Kepala Cabang + pihak yang mengajukan.'
            || case when coalesce(p_payload ->> 'no', '') <> '' then
                 E'\n\n❌ Kalau ada yang salah (misal salah blok), balas *TOLAK ' || (p_payload ->> 'no') || ' <alasan>* untuk membatalkan sebelum transfer -- akan diteruskan ke Kepala Cabang untuk diperbaiki.'
               else '' end,
          '/hr/finance-sync',
          jsonb_build_object('pengajuan_id', p_payload ->> 'pengajuan_id', 'proyek', p_payload ->> 'proyek')
        );
      end loop;

      select id into v_branch_id from public.branches where lower(name) = lower(p_payload ->> 'branch_name') limit 1;
      if p_payload ->> 'tipe' in ('bahan', 'tukang') and (p_payload ->> 'pengajuan_id') is not null then
        insert into public.finance_pending_transfers (pengajuan_id, proyek, tipe, branch_id, party_name, reference_no, nominal, admin_email)
        values (
          (p_payload ->> 'pengajuan_id')::bigint, coalesce(p_payload ->> 'proyek', '-'), p_payload ->> 'tipe', v_branch_id,
          p_payload ->> 'item', p_payload ->> 'no', coalesce((p_payload ->> 'nominal')::numeric, 0), p_payload ->> 'admin_email'
        );
      end if;

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
      insert into public.loonars_fee_wa_requests (fee_id, proyek, unit, buyer, marketing, fee_amount)
      values (
        (p_payload ->> 'fee_id')::bigint, p_payload ->> 'proyek', p_payload ->> 'unit',
        p_payload ->> 'buyer', p_payload ->> 'marketing', coalesce((p_payload ->> 'fee_amount')::numeric, 0)
      )
      on conflict (fee_id) do nothing;

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
            || E'\nNilai fee: Rp ' || to_char(coalesce((p_payload ->> 'fee_amount')::numeric, 0), 'FM999,999,999,999')
            || E'\n\n💬 Balas *YA* di WhatsApp ini untuk menyetujui (sementara, selama CFO belum bertugas di halaman Verifikasi Pengajuan).',
          '/hr/finance-sync',
          jsonb_build_object('fee_id', p_payload ->> 'fee_id', 'proyek', p_payload ->> 'proyek')
        );
      end loop;
      v_target_ref := p_payload ->> 'fee_id';

    elsif p_event_type = 'loonars_fee_decided' then
      for v_admin in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_admin.id, 'system', 'loonars_fee_alert',
          (case when p_payload ->> 'status' = 'approved' then 'Fee Disetujui' else 'Fee Ditolak' end)
            || ' — Unit ' || coalesce(p_payload ->> 'unit', '-'),
          'Fee marketing ' || coalesce(p_payload ->> 'marketing', '-')
            || ' untuk unit ' || coalesce(p_payload ->> 'unit', '-')
            || ' (' || coalesce(p_payload ->> 'proyek', '-') || ') '
            || (case when p_payload ->> 'status' = 'approved' then 'disetujui' else 'ditolak' end)
            || ' oleh ' || coalesce(p_payload ->> 'verified_by', 'CFO') || '.'
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
              || ', Unit: ' || coalesce(p_payload ->> 'unit', '-'),
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

    elsif p_event_type = 'loonars_closing_declared' then
      select e.id, e.branch_id into v_employee
      from public.employees e
      join auth.users u on u.id = e.id
      where lower(u.email) = lower(coalesce(p_payload ->> 'marketing_email', ''))
        and e.deleted_at is null and e.employment_status = 'active'
      limit 1;

      insert into public.loonars_closings (
        aset_id, proyek, blok, buyer, nik, phone, address, tipe, price, tgl,
        marketing_name, marketing_email, matched_employee_id, branch_id, status
      ) values (
        (p_payload ->> 'aset_id')::bigint,
        p_payload ->> 'proyek', p_payload ->> 'blok', p_payload ->> 'buyer',
        p_payload ->> 'nik', p_payload ->> 'phone', p_payload ->> 'address', p_payload ->> 'tipe',
        nullif(p_payload ->> 'price', '')::numeric, nullif(p_payload ->> 'tgl', '')::date,
        p_payload ->> 'marketing_name', p_payload ->> 'marketing_email', v_employee.id, v_employee.branch_id,
        'pending_verification'
      )
      on conflict (aset_id) do update set
        proyek = excluded.proyek, blok = excluded.blok, buyer = excluded.buyer,
        nik = excluded.nik, phone = excluded.phone, address = excluded.address,
        tipe = excluded.tipe, price = excluded.price, tgl = excluded.tgl,
        marketing_name = excluded.marketing_name, marketing_email = excluded.marketing_email,
        matched_employee_id = excluded.matched_employee_id, branch_id = excluded.branch_id,
        status = 'pending_verification', verified_by = null, verified_at = null, reject_reason = null,
        fee_requested = false, fee_amount = null, fee_phone = null, fee_requested_at = null,
        updated_at = now()
      returning id into v_closing_id;

      for v_admin in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_admin.id, 'system', 'loonars_fee_alert',
          'Closing Baru — Unit ' || coalesce(p_payload ->> 'blok', '-'),
          coalesce(p_payload ->> 'marketing_name', '-') || ' menutup unit ' || coalesce(p_payload ->> 'blok', '-')
            || ' (' || coalesce(p_payload ->> 'proyek', '-') || ')'
            || E'\nPembeli: ' || coalesce(p_payload ->> 'buyer', '-')
            || E'\nNilai: Rp ' || to_char(coalesce((p_payload ->> 'price')::numeric, 0), 'FM999,999,999,999')
            || E'\nMohon verifikasi apakah dana sudah masuk.',
          '/crm/finance',
          jsonb_build_object('loonars_closing_id', v_closing_id, 'aset_id', p_payload ->> 'aset_id')
        );
      end loop;

      v_target_ref := v_closing_id::text;

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
$function$;
