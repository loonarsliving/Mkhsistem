-- ============================================================================
-- MK Connect — 0261: Loonars 2 (Jogja) siteplan project + printable
-- "Kwitansi Tanda Jadi" booking receipt
--
-- Owner's request: the Jogja sales team needs to pick a Loonars 2 villa block
-- digitally; once they submit the booking-fee data the block locks itself,
-- and they must be able to print the buyer's booking receipt (kwitansi tanda
-- jadi) from the same screen.
--
-- Deliberately built ON TOP of the existing native Siteplan feature
-- (0202/0203/0204) rather than as a second module:
--   * block picking  -> loonars_units grid viewer (0203 row_label/sort_order)
--   * auto-locking   -> already the existing behaviour of
--     loonars_unit_purchase_submit: it raises if the unit isn't 'tersedia',
--     flips it to 'verifikasi', and loonars_unit_purchases_live_unit_idx
--     (a partial unique index) makes a second live purchase on the same unit
--     impossible even under a race. NOTHING about that flow is changed here.
--   * finance verify -> loonars_unit_purchase_verify (unchanged)
--   * fee claim      -> loonars_unit_fee_request, still akad-gated per 0204
--
-- What is genuinely new here:
--   1. The Loonars 2 project + its 20 villa units, seeded as catalog data
--      (same precedent as 0256's Loonars Coffee BOQ seed). No buyer/employee
--      PII enters git -- these are unit codes and row grouping only.
--   2. loonars_booking_receipts + loonars_receipt_counters: a numbered,
--      audit-stamped booking receipt issued once per purchase.
--
-- Receipt numbering is MKH/LNR/<4-digit seq>/<year>, matching the paper form
-- the owner supplied. The sequence is per calendar year and is allocated by
-- an atomic `insert .. on conflict do update .. returning` against
-- loonars_receipt_counters -- NOT `max(seq)+1`, which would hand two
-- concurrent sales reps the same number.
--
-- The receipt amount is NOT a fixed Rp 5.000.000 as the paper form printed:
-- per the owner it is whatever booking fee the rep actually entered on the
-- purchase (loonars_unit_purchases.booking_fee), snapshotted onto the
-- receipt row at issue time so a later edit to the purchase can never
-- silently change an already-printed receipt.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Loonars 2 project + units (catalog seed, idempotent)
--
-- Layout mirrors the marketing siteplan: two facing rows of ten villas down a
-- central walkway, AVARA on one side and BANYU on the other, numbered 01..10
-- from the entrance (Loonars Coffee / parking end) inwards. row_label +
-- sort_order are what the 0203 grid viewer renders, so this seed alone is
-- enough to make the siteplan appear -- no admin row-editor pass needed.
--
-- harga/luas/tipe are deliberately left NULL: the price list is not in this
-- repository and must never be guessed. A siteplan.manage holder fills them
-- in through /siteplan/admin. A NULL harga does not block a booking -- the
-- rep enters the agreed price on the purchase form.
-- ----------------------------------------------------------------------------
insert into public.loonars_projects (kode, nama, lokasi, warna)
values ('LNR2', 'Loonars 2 — Excellent Living', 'Yogyakarta', '#8B6F47')
on conflict (kode) do nothing;

insert into public.loonars_units (project_id, blok, row_label, sort_order)
select p.id, r.blok, r.row_label, r.sort_order
from public.loonars_projects p
cross join (
  select 'AVARA-' || lpad(n::text, 2, '0') as blok, 'AVARA' as row_label, n as sort_order
  from generate_series(1, 10) as n
  union all
  select 'BANYU-' || lpad(n::text, 2, '0'), 'BANYU', n
  from generate_series(1, 10) as n
) r
where p.kode = 'LNR2'
on conflict (project_id, blok) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Per-year receipt counter
--
-- One row per calendar year holding the last number handed out. Written only
-- by loonars_booking_receipt_issue (security definer) -- no client-side RLS
-- write policy at all, so a client can never skip or rewind the sequence.
-- ----------------------------------------------------------------------------
create table public.loonars_receipt_counters (
  year integer primary key,
  last_no integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.loonars_receipt_counters enable row level security;

comment on table public.loonars_receipt_counters is
  'Per-calendar-year counter for booking receipt numbers (MKH/LNR/NNNN/YYYY). Allocated atomically inside loonars_booking_receipt_issue; RLS is on with NO policies, so only that security-definer function can touch it.';

-- ----------------------------------------------------------------------------
-- 3. loonars_booking_receipts -- one issued receipt per purchase
--
-- Separate table rather than columns on loonars_unit_purchases, matching how
-- 0202 already keeps the fee claim (loonars_unit_fee_requests) out of the
-- purchase row: issuing a receipt is its own event with its own actor and
-- timestamp, and the purchase row keeps meaning exactly what it meant before.
-- ----------------------------------------------------------------------------
create table public.loonars_booking_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.loonars_unit_purchases(id) on delete cascade,
  unit_id uuid not null references public.loonars_units(id) on delete cascade,
  receipt_no text not null unique,
  receipt_year integer not null,
  receipt_seq integer not null,
  -- Snapshot of what was actually printed, taken at issue time.
  amount numeric not null check (amount > 0),
  buyer_name text not null,
  buyer_phone text,
  unit_label text not null,
  payment_method text not null,
  issued_by uuid references public.employees(id) on delete set null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_year, receipt_seq)
);

create index loonars_booking_receipts_unit_idx on public.loonars_booking_receipts (unit_id);
create index loonars_booking_receipts_issued_by_idx on public.loonars_booking_receipts (issued_by);

alter table public.loonars_booking_receipts enable row level security;

-- Same audience as the purchase itself (0202's loonars_unit_purchases_select):
-- the rep who made the sale, or finance. The receipt carries buyer name and
-- phone, so it is not broadly readable like the unit catalog.
create policy "loonars_booking_receipts_select" on public.loonars_booking_receipts
  for select to authenticated
  using (
    exists (
      select 1 from public.loonars_unit_purchases pu
      where pu.id = loonars_booking_receipts.purchase_id
        and (pu.marketing_employee_id = auth.uid() or public.app_has_permission('prospect.finance_verify'))
    )
    or public.app_has_permission('siteplan.manage')
  );

-- No insert/update/delete policies: every write goes through
-- loonars_booking_receipt_issue below. A receipt number, once printed and
-- handed to a buyer, is not something a client should be able to rewrite.

drop trigger if exists loonars_booking_receipts_set_updated_at on public.loonars_booking_receipts;
create trigger loonars_booking_receipts_set_updated_at
  before update on public.loonars_booking_receipts
  for each row execute function public.set_updated_at();

comment on table public.loonars_booking_receipts is
  'One issued "Kwitansi Tanda Jadi" per booking purchase. amount/buyer_name/buyer_phone/unit_label/payment_method are a SNAPSHOT of the purchase at issue time -- the printed paper must stay reproducible even if the purchase row is later edited. Issued only via loonars_booking_receipt_issue.';

-- ----------------------------------------------------------------------------
-- 4. loonars_booking_receipt_issue -- idempotent issue/fetch
--
-- Called by the "Cetak Kwitansi" button. First call allocates a number and
-- snapshots the purchase; every later call returns the same row unchanged, so
-- a reprint (lost sheet, printer jam, buyer wants a copy) never burns a
-- second number or produces a second document for the same booking.
-- ----------------------------------------------------------------------------
create or replace function public.loonars_booking_receipt_issue(p_purchase_id uuid)
returns public.loonars_booking_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.loonars_unit_purchases%rowtype;
  v_unit public.loonars_units%rowtype;
  v_existing public.loonars_booking_receipts%rowtype;
  v_result public.loonars_booking_receipts%rowtype;
  v_year integer := extract(year from now())::integer;
  v_seq integer;
begin
  select * into v_purchase from public.loonars_unit_purchases where id = p_purchase_id;
  if not found then
    raise exception 'Pembelian tidak ditemukan';
  end if;

  -- Same audience as the receipt's select policy: the owning rep, finance, or
  -- a siteplan admin. Re-checked here because this function is security
  -- definer and therefore bypasses RLS.
  if v_purchase.marketing_employee_id is distinct from v_user_id
     and not public.app_has_permission('prospect.finance_verify')
     and not public.app_has_permission('siteplan.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  -- Already issued -> hand back the identical row (reprint path).
  select * into v_existing from public.loonars_booking_receipts where purchase_id = p_purchase_id;
  if found then
    return v_existing;
  end if;

  if v_purchase.transaction_type <> 'booking' then
    raise exception 'Kwitansi tanda jadi hanya untuk transaksi Booking Fee';
  end if;
  if v_purchase.status = 'rejected' then
    raise exception 'Pembelian sudah ditolak, kwitansi tidak dapat diterbitkan';
  end if;
  if v_purchase.booking_fee is null or v_purchase.booking_fee <= 0 then
    raise exception 'Nominal booking fee belum diisi pada pembelian ini';
  end if;

  select * into v_unit from public.loonars_units where id = v_purchase.unit_id;

  -- Atomic per-year allocation. `on conflict do update` takes a row lock, so
  -- two reps clicking Cetak at the same moment serialise here and get
  -- distinct numbers instead of colliding on the unique index below.
  insert into public.loonars_receipt_counters (year, last_no, updated_at)
  values (v_year, 1, now())
  on conflict (year) do update set
    last_no = public.loonars_receipt_counters.last_no + 1,
    updated_at = now()
  returning last_no into v_seq;

  insert into public.loonars_booking_receipts (
    purchase_id, unit_id, receipt_no, receipt_year, receipt_seq,
    amount, buyer_name, buyer_phone, unit_label, payment_method, issued_by
  ) values (
    p_purchase_id,
    v_purchase.unit_id,
    'MKH/LNR/' || lpad(v_seq::text, 4, '0') || '/' || v_year::text,
    v_year,
    v_seq,
    v_purchase.booking_fee,
    v_purchase.buyer_name,
    v_purchase.phone,
    coalesce(v_unit.blok, '-'),
    v_purchase.payment_method,
    v_user_id
  )
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.loonars_booking_receipt_issue(uuid) to authenticated;

comment on function public.loonars_booking_receipt_issue is
  'Issues (or, on a reprint, re-returns) the Kwitansi Tanda Jadi for a booking purchase. Idempotent per purchase; allocates MKH/LNR/NNNN/YYYY from loonars_receipt_counters atomically. Rejects non-booking transaction types, rejected purchases, and purchases with no booking_fee. Callable by the owning marketing rep, prospect.finance_verify, or siteplan.manage.';
