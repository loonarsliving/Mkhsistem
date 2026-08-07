-- ============================================================================
-- MK Connect — 0187: fix loonars_closing_verify/reject/fee_request silently
-- no-op'ing on a re-declared closing
--
-- Bug: loonars_closings has unique(aset_id), so re-declaring a closing for a
-- unit whose previous cycle already completed (e.g. buyer fell through, a
-- new buyer takes the same unit) UPDATEs the same row instead of inserting a
-- new one -- loonars_closings.id (p_id) never changes across cycles.
--
-- loonars_closing_verify/reject and loonars_fee_request built their outbound
-- sync_log idempotency_key purely from p_id ('mkc:loonars-verified:' || p_id,
-- etc). So verifying (or claiming a fee on) a SECOND cycle for the same unit
-- reused the exact same key as the FIRST cycle's already-succeeded event --
-- `on conflict (idempotency_key) do nothing` silently dropped the new
-- outbound row. The local loonars_closings update still succeeded (status
-- flipped, fee_requested flipped), so the UI looked fine, but MKH Property
-- never received the second verification or fee claim: no jurnal entry, no
-- aset.status flip to terjual, and no loonars_fee row for the CFO/WhatsApp
-- queue to act on. This is why a re-declared unit's fee claim silently goes
-- nowhere.
--
-- Fix: append a clock_timestamp()-based suffix to each idempotency_key,
-- matching the pattern loonars_closing_declared_sync (0011/0012) already
-- uses for exactly this reason.
-- ============================================================================

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
    'outbound', 'loonars_closing_verified', 'loonars_closings', p_id,
    'mkc:loonars-verified:' || p_id || '-' || extract(epoch from clock_timestamp())::bigint,
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
    'outbound', 'loonars_closing_rejected', 'loonars_closings', p_id,
    'mkc:loonars-rejected:' || p_id || '-' || extract(epoch from clock_timestamp())::bigint,
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
    'outbound', 'loonars_fee_requested', 'loonars_closings', p_id,
    'mkc:loonars-fee-req:' || p_id || '-' || extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object(
      'proyek', v_row.proyek, 'unit', v_row.blok, 'buyer', v_row.buyer,
      'marketing', v_row.marketing_name, 'phone', coalesce(v_phone, ''),
      'price', v_row.price, 'type', v_row.tipe, 'tgl', v_row.tgl, 'fee_amount', p_fee_amount
    )
  )
  on conflict (idempotency_key) do nothing;
end;
$$;

comment on function public.loonars_closing_verify is 'Finance verifies a loonars-sales closing: flips it to verified, enqueues loonars_closing_verified (MKH Property posts cash-in + marks the unit terjual), notifies the matched sales rep in-app. Idempotency key includes a timestamp suffix so a re-declared closing (same loonars_closings.id, new buyer/price) does not collide with an earlier cycle''s already-sent event.';
comment on function public.loonars_closing_reject is 'Finance rejects a loonars-sales closing: enqueues loonars_closing_rejected (MKH Property reverts the unit to tersedia). Idempotency key includes a timestamp suffix for the same reason as loonars_closing_verify.';
comment on function public.loonars_fee_request is 'The matched sales rep claims their fee on a verified closing: enqueues loonars_fee_requested (MKH Property inserts into loonars_fee, reusing the existing submit/approve pipeline and superadmin WhatsApp alert). Idempotency key includes a timestamp suffix for the same reason as loonars_closing_verify.';
