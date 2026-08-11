-- ============================================================================
-- MK Connect — 0204: siteplan closing notifies Kepala Cabang too, fee claim
-- gated to full payment (akad)
--
-- Owner's explicit rule:
-- 1. When a sales rep declares a closing (loonars_unit_purchase_submit), both
--    Super Admin AND the branch's own Kepala Cabang get a WhatsApp alert (not
--    Super Admin alone as before).
-- 2. Once Finance verifies the closing (loonars_unit_purchase_verify), the
--    unit's status flips and its box color changes on the siteplan grid --
--    unchanged, already the existing behavior.
-- 3. A sales rep can only claim their fee (loonars_unit_fee_request) once the
--    purchase is BOTH verified AND the transaction is a full payment
--    (transaction_type = 'akad') -- a Booking Fee or DP-only verified
--    purchase must not be fee-claimable yet.
-- ============================================================================

create or replace function public.loonars_unit_purchase_submit(
  p_unit_id uuid,
  p_buyer_name text,
  p_nik text default null,
  p_phone text default null,
  p_address text default null,
  p_transaction_type text default 'booking',
  p_payment_method text default 'cash',
  p_price numeric default null,
  p_booking_fee numeric default null,
  p_dp_amount numeric default null,
  p_pelunasan_amount numeric default null,
  p_handover_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee record;
  v_unit public.loonars_units%rowtype;
  v_purchase_id uuid;
  v_recipient record;
begin
  select e.id, e.branch_id, e.full_name into v_employee
  from public.employees e
  where e.id = auth.uid() and e.deleted_at is null and e.employment_status = 'active';

  if v_employee.id is null then
    raise exception 'Karyawan tidak ditemukan atau tidak aktif' using errcode = '28000';
  end if;

  if p_buyer_name is null or btrim(p_buyer_name) = '' then
    raise exception 'Nama pembeli wajib diisi';
  end if;
  if p_transaction_type not in ('booking', 'dp', 'akad') then
    raise exception 'Tipe transaksi tidak valid';
  end if;
  if p_payment_method not in ('cash', 'kpr', 'both') then
    raise exception 'Metode pembayaran tidak valid';
  end if;

  select * into v_unit from public.loonars_units where id = p_unit_id for update;
  if not found then
    raise exception 'Unit tidak ditemukan';
  end if;
  if v_unit.status <> 'tersedia' then
    raise exception 'Unit % sudah tidak tersedia (status: %)', v_unit.blok, v_unit.status;
  end if;

  insert into public.loonars_unit_purchases (
    unit_id, buyer_name, nik, phone, address, transaction_type, payment_method,
    price, booking_fee, dp_amount, pelunasan_amount, handover_date,
    marketing_employee_id, branch_id, notes
  ) values (
    p_unit_id, p_buyer_name, p_nik, p_phone, p_address, p_transaction_type, p_payment_method,
    p_price, p_booking_fee, p_dp_amount, p_pelunasan_amount, p_handover_date,
    v_employee.id, v_employee.branch_id, p_notes
  )
  returning id into v_purchase_id;

  update public.loonars_units set status = 'verifikasi', updated_at = now() where id = p_unit_id;

  -- Alert every active Super Admin, plus the submitting employee's own
  -- branch's Kepala Cabang (owner's call, 0204) -- both need to know a
  -- closing is awaiting finance verification.
  for v_recipient in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active'
      and (
        r.key = 'super_admin'
        or (r.key = 'kepala_cabang' and em.branch_id = v_employee.branch_id)
      )
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_recipient.id, 'system', 'loonars_fee_alert',
      'Siteplan: Unit Baru Diajukan — ' || v_unit.blok,
      coalesce(v_employee.full_name, '-') || ' mengajukan pembelian unit ' || v_unit.blok
        || E'\nPembeli: ' || p_buyer_name
        || E'\nTipe: ' || p_transaction_type || ', Metode: ' || p_payment_method
        || E'\nMohon verifikasi apakah dana sudah masuk.',
      '/crm/finance',
      jsonb_build_object('loonars_unit_purchase_id', v_purchase_id, 'unit_id', p_unit_id)
    );
  end loop;

  return v_purchase_id;
end;
$$;

comment on function public.loonars_unit_purchase_submit is
  'A marketing employee declares a buyer for an available unit. Resolves the caller via auth.uid() = employees.id, raises if the unit is not currently tersedia (no double-booking), flips the unit to verifikasi, and alerts every active super_admin plus the employee''s own branch Kepala Cabang (loonars_fee_alert category, 0204).';

create or replace function public.loonars_unit_fee_request(p_purchase_id uuid, p_fee_amount numeric, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_purchases%rowtype;
  v_unit public.loonars_units%rowtype;
  v_fee_id uuid;
  v_admin record;
begin
  select * into v_row from public.loonars_unit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Purchase not found';
  end if;
  if v_row.marketing_employee_id is distinct from v_user_id then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_row.status <> 'verified' then
    raise exception 'Belum terverifikasi';
  end if;
  -- Owner's explicit rule (0204): fee can only be claimed once the
  -- transaction is a full payment (akad/lunas) -- a verified Booking Fee or
  -- DP-only purchase is not fee-claimable yet.
  if v_row.transaction_type <> 'akad' then
    raise exception 'Fee hanya bisa diajukan setelah pembayaran lunas (akad)';
  end if;
  if p_fee_amount is null or p_fee_amount <= 0 then
    raise exception 'Nominal fee tidak valid';
  end if;
  if exists (
    select 1 from public.loonars_unit_fee_requests
    where purchase_id = p_purchase_id and status <> 'rejected'
  ) then
    raise exception 'Fee sudah diajukan';
  end if;

  select * into v_unit from public.loonars_units where id = v_row.unit_id;

  insert into public.loonars_unit_fee_requests (purchase_id, unit_id, marketing_employee_id, fee_amount, phone)
  values (p_purchase_id, v_row.unit_id, v_user_id, p_fee_amount, p_phone)
  returning id into v_fee_id;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'loonars_fee_alert',
      'Pengajuan Fee Siteplan — Unit ' || coalesce(v_unit.blok, '-'),
      'Marketing mengajukan fee untuk unit ' || coalesce(v_unit.blok, '-')
        || E'\nPembeli: ' || coalesce(v_row.buyer_name, '-')
        || E'\nNilai fee: Rp ' || to_char(p_fee_amount, 'FM999,999,999,999'),
      '/siteplan/fee-requests',
      jsonb_build_object('loonars_unit_fee_request_id', v_fee_id, 'unit_id', v_row.unit_id)
    );
  end loop;

  return v_fee_id;
end;
$$;

comment on function public.loonars_unit_fee_request is
  'The marketing rep who owns a verified, full-payment (akad) purchase claims their fee. Raises if the caller is not the owning rep, if the purchase is not verified, if the transaction isn''t akad (0204), or if a live (non-rejected) fee request already exists. Alerts every active super_admin.';
