-- ============================================================================
-- MK Connect — 0273: let a verified Booking Fee purchase continue to DP
--
-- Real incident: Wahyudha Wibisono (Jogja) submitted a Rp5jt Booking Fee for
-- BANYU-10 (Loonars 2), a kwitansi was issued (MKH/LNR/0001/2026), and the
-- owner verified it. The buyer (Susanto August Satria) then separately paid
-- a DP on top of that booking fee -- but the native siteplan schema has no
-- concept of a purchase progressing through payment stages: one unit has
-- exactly one purchase row, and its transaction_type is set once at
-- loonars_unit_purchase_submit and never changes. Once verified, the unit
-- flips to 'terjual' and loonars_unit_purchase_submit itself refuses a
-- second attempt ("Unit % sudah tidak tersedia"). So there was no way for
-- the rep to ever record that second payment, and loonars_unit_fee_request's
-- akad-only gate (0204) means the rep can never claim a fee either.
--
-- Owner's explicit call: this is a one-off correction path, NOT a general
-- multi-stage payment ledger -- scoped to exactly the transition this
-- incident needs (a verified Booking Fee purchase moving to DP), not
-- DP -> Akad or any further stage. A genuinely recurring need for staged
-- payments belongs in its own future migration with the owner's sign-off,
-- per CLAUDE.md's "never change architecture without approval".
--
-- loonars_unit_purchase_record_dp_followup:
--   - Same caller audience as every other purchase-mutating RPC here: the
--     purchase's own marketing_employee_id, or siteplan.manage.
--   - Only fires from status = 'verified' AND transaction_type = 'booking'
--     (raises a clear message otherwise) -- so it can't be used to edit an
--     already-DP or already-Akad purchase, or one still pending/rejected.
--   - Flips transaction_type to 'dp', records the DP/pelunasan amounts and
--     handover date, and resets status to 'pending_verification' (clearing
--     the previous verified_by/verified_at) so Finance verifies the new
--     money the same way as any other submission -- loonars_unit_purchase_
--     verify/reject need no changes, they already work on any pending row
--     regardless of transaction_type.
--   - Unit status goes back to 'verifikasi' (pending look on the grid)
--     until Finance verifies the DP, same as the original submit flow.
--   - The original Rp5jt booking-fee kwitansi (loonars_booking_receipts)
--     is untouched -- it was a real document for real money received and
--     stays reproducible; this migration only concerns the purchase's
--     current-stage bookkeeping, not receipt history.
-- ============================================================================

create or replace function public.loonars_unit_purchase_record_dp_followup(
  p_purchase_id uuid,
  p_dp_amount numeric,
  p_handover_date date,
  p_pelunasan_amount numeric default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_purchases%rowtype;
  v_actor_name text;
begin
  select * into v_row from public.loonars_unit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Pembelian tidak ditemukan';
  end if;

  if v_row.marketing_employee_id is distinct from v_user_id and not public.app_has_permission('siteplan.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if v_row.status <> 'verified' then
    raise exception 'Hanya pembelian yang sudah diverifikasi Finance yang dapat dilanjutkan ke DP';
  end if;
  if v_row.transaction_type <> 'booking' then
    raise exception 'Hanya transaksi Booking Fee yang dapat dilanjutkan ke DP';
  end if;

  if p_dp_amount is null or p_dp_amount <= 0 then
    raise exception 'Nominal DP tidak valid';
  end if;
  if p_handover_date is null then
    raise exception 'Tanggal serah terima wajib diisi';
  end if;

  update public.loonars_unit_purchases set
    transaction_type = 'dp',
    dp_amount = p_dp_amount,
    pelunasan_amount = p_pelunasan_amount,
    handover_date = p_handover_date,
    status = 'pending_verification',
    verified_by = null,
    verified_at = null,
    notes = coalesce(p_notes, notes),
    updated_at = now()
  where id = p_purchase_id;

  update public.loonars_units set status = 'verifikasi', updated_at = now() where id = v_row.unit_id;

  select full_name into v_actor_name from public.employees where id = v_user_id;

  -- Same alert pattern as loonars_unit_purchase_submit (0204): Super Admin
  -- plus the purchase's own branch Kepala Cabang need to know a follow-up
  -- DP is waiting on verification again.
  insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
  select
    em.id, 'system', 'loonars_fee_alert',
    'Siteplan: Lanjutan DP Diajukan',
    coalesce(v_actor_name, '-') || ' mengajukan lanjutan pembayaran DP untuk pembelian ' || coalesce(v_row.buyer_name, '-')
      || E'\nNominal DP: Rp ' || to_char(p_dp_amount, 'FM999,999,999,999')
      || E'\nMohon verifikasi apakah dana sudah masuk.',
    '/crm/finance',
    jsonb_build_object('loonars_unit_purchase_id', p_purchase_id, 'unit_id', v_row.unit_id)
  from public.employees em
  join public.roles r on r.id = em.role_id
  where em.deleted_at is null and em.employment_status = 'active'
    and (
      r.key = 'super_admin'
      or (r.key = 'kepala_cabang' and em.branch_id = v_row.branch_id)
    );
end;
$$;

grant execute on function public.loonars_unit_purchase_record_dp_followup(uuid, numeric, date, numeric, text) to authenticated;
revoke all on function public.loonars_unit_purchase_record_dp_followup(uuid, numeric, date, numeric, text) from public, anon;

comment on function public.loonars_unit_purchase_record_dp_followup is
  'One-off correction path (0273), not a general payment-stage ledger: lets the owning rep (or siteplan.manage) record a follow-up DP payment against their own verified Booking Fee purchase, resetting it to pending_verification so Finance re-checks the new money. Raises unless the purchase is currently verified + booking. Does not touch the original booking-fee kwitansi.';
