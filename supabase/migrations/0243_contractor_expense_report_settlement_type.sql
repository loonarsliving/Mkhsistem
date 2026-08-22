-- Owner's fix for the real Anang incident: a nota photo was sent
-- straight to Vando as a "laporan" (COCOK/TOLAK matching against an
-- advance already transferred) the moment it arrived, with nobody ever
-- asking whether it was actually REIMBURSE (money not yet paid by the
-- company, needs a fresh pengajuan) or PELAPORAN (already paid via an
-- advance, just documentation). Anang's own later "REIMBURSE Rp
-- 2.031.000" text had nowhere to attach, and the report he'd sent as
-- reimburse had already gone out to Vando as a laporan to match.
--
-- Now: a nota photo is held (never sent to Vando) until the contractor
-- states which one it is. settlement_type is null while awaiting that
-- answer.
alter table public.contractor_expense_reports
  add column settlement_type text check (settlement_type in ('reimburse', 'pelaporan'));
