-- Real incident: Anang submitted a near-duplicate nota one minute after the
-- first (same 3 items, same total Rp 27.000, just "kuar 2\"" misread/retyped
-- as "kuar 2.5\""), then tried to self-correct via WA ("Ralat sudah
-- dimasukan. Hapus") -- the message went unrecognized (fixed separately),
-- and the duplicate sat un-flagged for days until Super Admin caught it
-- manually. This column lets trySubmitContractorReceiptReport flag a
-- likely duplicate the moment it's submitted (same contractor, same total,
-- same per-item values, within a short window) instead of only ever
-- catching it after the fact.
alter table public.contractor_expense_reports
  add column duplicate_of_id bigint references public.contractor_expense_reports(id);
