-- Owner's ask: Anang's fund requests (contractor-fund-request.ts) never
-- carried a destination bank account at all -- only category (gaji/
-- material) was ever asked. keterangan (which later becomes
-- finance_pending_transfers.rekening_tujuan once approved) had nothing
-- for the bukti-transfer auto-matching to compare against, which is
-- exactly the class of bug that caused the KK-210/KK-228 mismatch earlier.
--
-- bank_account remembers a contractor's account once given, so he isn't
-- asked again on every future request. contractor_fund_request_pending
-- gains kategori/rekening (both nullable) so either piece can be the one
-- still missing when a request is held for clarification -- previously
-- the pending row only ever meant "kategori is the missing piece".
alter table public.contractor_wa_senders
  add column bank_account text;

alter table public.contractor_fund_request_pending
  add column kategori text check (kategori in ('gaji', 'material')),
  add column rekening text;
