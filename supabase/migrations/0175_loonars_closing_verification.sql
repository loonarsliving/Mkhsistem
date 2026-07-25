-- ============================================================================
-- MK Connect — 0175: loonars-sales closing verification flow
--
-- Companion to MKH Property's 0011_loonars_closing_verification_flow.sql.
-- Replaces the old "Ajukan Fee" form in loonars-sales with:
--
-- 1. Sales declares a closing in loonars-sales (block + buyer/price, no fee
--    form anymore) -> MKH Property's aset moves to 'verifikasi' -> outbound
--    loonars_closing_declared -> this migration's new sync_inbound branch
--    matches the marketing's email to an employee and upserts a row into
--    the new loonars_closings table, notifying every super_admin (reusing
--    the existing loonars_fee_alert category, already WhatsApp-enabled).
--
-- 2. super_admin verifies/rejects it from a new section on the existing
--    /crm/finance page (loonars_closing_verify / loonars_closing_reject
--    RPCs below) -- deliberately NOT reusing prospect_payments/
--    crm_approve_payment, since that recomputes commission from
--    sales_targets.commission_percent, which would silently produce the
--    wrong number for a loonars-sales fee (a flat amount the sales rep
--    enters themselves, unrelated to CRM commission_percent).
--    Verifying enqueues an outbound loonars_closing_verified event (MKH
--    Property flips the unit to terjual + posts the cash-in journal, which
--    used to happen immediately client-side); rejecting enqueues
--    loonars_closing_rejected (unit reverts to tersedia).
--
-- 3. Once verified, the matched sales rep sees a "Klaim Fee" card on their
--    own MK Connect dashboard (features/dashboard). Submitting it
--    (loonars_fee_request RPC) enqueues loonars_fee_requested, which MKH
--    Property turns into a normal `loonars_fee` insert -- reusing the
--    existing trg_loonars_fee_submitted_sync (0009) and this project's own
--    existing loonars_fee_submitted branch below, so the superadmin
--    WhatsApp alert and the owner's approve/reject flow in loonars-sales
--    are both untouched.
-- ============================================================================

create table public.loonars_closings (
  id uuid primary key default gen_random_uuid(),
  aset_id bigint not null,
  proyek text not null,
  blok text not null,
  buyer text,
  nik text,
  phone text,
  address text,
  tipe text,
  price numeric,
  tgl date,
  marketing_name text,
  marketing_email text,
  matched_employee_id uuid references public.employees(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  status text not null default 'pending_verification' check (status in ('pending_verification', 'verified', 'rejected')),
  verified_by uuid references public.employees(id) on delete set null,
  verified_at timestamptz,
  reject_reason text,
  fee_requested boolean not null default false,
  fee_amount numeric,
  fee_phone text,
  fee_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aset_id)
);

alter table public.loonars_closings enable row level security;

create policy "loonars_closings_select" on public.loonars_closings
  for select to authenticated
  using (matched_employee_id = auth.uid() or public.app_has_permission('prospect.finance_verify'));

comment on table public.loonars_closings is
  'Loonars-sales closings pending/verified/rejected in Verifikasi Pembayaran, mirrored from MKH Property''s aset table via loonars_closing_declared sync events. One row per aset_id (re-declaring after a rejection upserts the same row).';

-- ----------------------------------------------------------------------------
-- sync_inbound: add loonars_closing_declared. CREATE OR REPLACE with the
-- full live body (queried directly from production) plus the new branch --
-- see 0174's header for why this matters.
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
  v_closing_id uuid;
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
$$;

comment on function public.sync_inbound is
  'PostgREST-callable receiver for MKH Property -> MK Connect sync events (finance_payment_confirmed, finance_expense_submitted, finance_expense_approved, finance_branch_balance_updated, loonars_fee_submitted, loonars_closing_approved, loonars_closing_declared). Authenticated via X-Sync-Secret header against Supabase Vault, not JWT.';

-- ----------------------------------------------------------------------------
-- Verify / reject / request-fee RPCs, called from /crm/finance and the
-- dashboard card. Each enqueues the matching outbound event for MKH
-- Property's sync_inbound (0011) to pick up via the existing
-- sync_dispatch_pending() cron.
-- ----------------------------------------------------------------------------
create or replace function public.loonars_closing_verify(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_closings%rowtype;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_row from public.loonars_closings where id = p_id for update;
  if not found then
    raise exception 'Closing not found';
  end if;
  if v_row.status <> 'pending_verification' then
    raise exception 'Closing sudah diputuskan';
  end if;

  update public.loonars_closings set
    status = 'verified', verified_by = v_user_id, verified_at = now(), updated_at = now()
  where id = p_id;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'loonars_closing_verified', 'loonars_closings', p_id::text,
    'mkc:loonars-verified:' || p_id,
    jsonb_build_object('aset_id', v_row.aset_id, 'proyek', v_row.proyek, 'blok', v_row.blok, 'price', v_row.price, 'tgl', v_row.tgl)
  )
  on conflict (idempotency_key) do nothing;

  if v_row.matched_employee_id is not null then
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_row.matched_employee_id, 'system', 'closing_approved',
      'Pembayaran Terverifikasi — Unit ' || coalesce(v_row.blok, '-'),
      'Dana closing unit ' || coalesce(v_row.blok, '-') || ' (' || coalesce(v_row.proyek, '-') || ') sudah terverifikasi. Silakan ajukan fee dari dashboard.',
      '/dashboard'
    );
  end if;
end;
$$;

create or replace function public.loonars_closing_reject(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_closings%rowtype;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_row from public.loonars_closings where id = p_id for update;
  if not found then
    raise exception 'Closing not found';
  end if;
  if v_row.status <> 'pending_verification' then
    raise exception 'Closing sudah diputuskan';
  end if;

  update public.loonars_closings set
    status = 'rejected', verified_by = v_user_id, verified_at = now(), reject_reason = p_reason, updated_at = now()
  where id = p_id;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'loonars_closing_rejected', 'loonars_closings', p_id::text,
    'mkc:loonars-rejected:' || p_id,
    jsonb_build_object('aset_id', v_row.aset_id)
  )
  on conflict (idempotency_key) do nothing;

  if v_row.matched_employee_id is not null then
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_row.matched_employee_id, 'system', 'rejected',
      'Closing Ditolak — Unit ' || coalesce(v_row.blok, '-'),
      'Closing unit ' || coalesce(v_row.blok, '-') || ' ditolak' || case when p_reason is not null and p_reason <> '' then ': ' || p_reason else '.' end,
      '/dashboard'
    );
  end if;
end;
$$;

create or replace function public.loonars_fee_request(p_id uuid, p_fee_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_closings%rowtype;
  v_phone text;
begin
  select * into v_row from public.loonars_closings where id = p_id for update;
  if not found then
    raise exception 'Closing not found';
  end if;
  if v_row.matched_employee_id is distinct from v_user_id then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_row.status <> 'verified' then
    raise exception 'Belum terverifikasi';
  end if;
  if v_row.fee_requested then
    raise exception 'Fee sudah diajukan';
  end if;
  if p_fee_amount is null or p_fee_amount <= 0 then
    raise exception 'Nominal fee tidak valid';
  end if;

  select phone into v_phone from public.employees where id = v_user_id;

  update public.loonars_closings set
    fee_requested = true, fee_amount = p_fee_amount, fee_phone = v_phone, fee_requested_at = now(), updated_at = now()
  where id = p_id;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'loonars_fee_requested', 'loonars_closings', p_id::text,
    'mkc:loonars-fee-req:' || p_id,
    jsonb_build_object(
      'proyek', v_row.proyek, 'unit', v_row.blok, 'buyer', v_row.buyer,
      'marketing', v_row.marketing_name, 'phone', coalesce(v_phone, ''),
      'price', v_row.price, 'type', v_row.tipe, 'tgl', v_row.tgl, 'fee_amount', p_fee_amount
    )
  )
  on conflict (idempotency_key) do nothing;
end;
$$;

grant execute on function public.loonars_closing_verify(uuid) to authenticated;
grant execute on function public.loonars_closing_reject(uuid, text) to authenticated;
grant execute on function public.loonars_fee_request(uuid, numeric) to authenticated;

comment on function public.loonars_closing_verify is 'Finance verifies a loonars-sales closing: flips it to verified, enqueues loonars_closing_verified (MKH Property posts cash-in + marks the unit terjual), notifies the matched sales rep in-app.';
comment on function public.loonars_closing_reject is 'Finance rejects a loonars-sales closing: enqueues loonars_closing_rejected (MKH Property reverts the unit to tersedia).';
comment on function public.loonars_fee_request is 'The matched sales rep claims their fee on a verified closing: enqueues loonars_fee_requested (MKH Property inserts into loonars_fee, reusing the existing submit/approve pipeline and superadmin WhatsApp alert).';
