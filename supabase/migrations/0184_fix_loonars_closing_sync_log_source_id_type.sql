-- ============================================================================
-- MK Connect — 0184: fix loonars closing verify/reject/fee-request crashing
--
-- Bug: loonars_closing_verify, loonars_closing_reject, and loonars_fee_request
-- (0175) each insert into public.sync_log using `p_id::text` for source_id.
-- sync_log.source_id is `uuid`, not `text` -- casting the uuid p_id to text
-- first makes Postgres reject the implicit text->uuid assignment on INSERT
-- ("column "source_id" is of type uuid but expression is of type text"),
-- so every call raised an exception and rolled back before ever flipping
-- loonars_closings.status. This is why clicking "Verifikasi" (or "Tolak", or
-- claiming a fee) on /crm/finance never actually verified/rejected anything.
--
-- Fix: drop the `::text` cast -- p_id is already uuid, matching the column.
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
    'outbound', 'loonars_closing_rejected', 'loonars_closings', p_id,
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
    'outbound', 'loonars_fee_requested', 'loonars_closings', p_id,
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

comment on function public.loonars_closing_verify is 'Finance verifies a loonars-sales closing: flips it to verified, enqueues loonars_closing_verified (MKH Property posts cash-in + marks the unit terjual), notifies the matched sales rep in-app.';
comment on function public.loonars_closing_reject is 'Finance rejects a loonars-sales closing: enqueues loonars_closing_rejected (MKH Property reverts the unit to tersedia).';
comment on function public.loonars_fee_request is 'The matched sales rep claims their fee on a verified closing: enqueues loonars_fee_requested (MKH Property inserts into loonars_fee, reusing the existing submit/approve pipeline and superadmin WhatsApp alert).';
