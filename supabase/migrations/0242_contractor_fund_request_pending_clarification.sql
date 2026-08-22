-- Owner's real incident: Anang answered "REIMBURSE uang belanja sebesar
-- Rp. 2.031.000" -- AI correctly asked "gaji/upah tukang atau beli
-- material?" (needs_category_clarification), but Anang's short follow-up
-- ("Beli matrial", no nominal restated) fell through recognizeFundRequestText
-- as not_a_request, since the flow had no memory of the amount it had just
-- asked about -- landing on the generic "kirim foto nota / jelaskan
-- kebutuhan dana" canned reply instead of completing the submission.
--
-- This table remembers exactly what was asked (nominal, items, keterangan,
-- ai_notes) per contractor so a short category-only reply can complete the
-- original request instead of the contractor having to retype everything.
create table public.contractor_fund_request_pending (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractor_wa_senders(id) on delete cascade,
  nominal numeric not null,
  items jsonb not null,
  keterangan text not null,
  ai_notes text,
  created_at timestamptz not null default now()
);
create index contractor_fund_request_pending_contractor_idx on public.contractor_fund_request_pending (contractor_id, created_at desc);
