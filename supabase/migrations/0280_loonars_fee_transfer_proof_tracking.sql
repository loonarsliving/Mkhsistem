-- ============================================================================
-- MK Connect — 0280: track when a Loonars fee payout's transfer proof was
-- captured, so it can be auto-forwarded to the sales rep over WhatsApp
--
-- Owner's ask: reuse the same "Super Admin replies with a bukti transfer
-- photo on WhatsApp" mechanism already used for pengajuan bahan/tukang
-- (tryConfirmTransferProofViaWhatsApp) and construction expense settlement
-- (tryConfirmConstructionExpenseSettlementViaWhatsApp) for Loonars fee
-- payouts too -- match the photo against a still-open approved fee by
-- nominal + recipient name, then forward it straight to the marketing rep
-- instead of the owner having to post it into an unrelated WhatsApp group
-- that has no idea what to do with it.
--
-- These columns are purely a marker so a fee is matched (and its photo
-- forwarded) at most once -- no RLS changes needed, same as 0277's bank
-- columns riding along on existing '*' selects.
-- ============================================================================

alter table public.loonars_unit_fee_requests add column transfer_confirmed_at timestamptz;
alter table public.loonars_unit_fee_requests add column transfer_confirmed_by uuid references public.employees(id) on delete set null;
alter table public.loonars_unit_fee_requests add column transfer_proof_url text;

comment on column public.loonars_unit_fee_requests.transfer_confirmed_at is 'Set once a bukti transfer photo for this fee was matched and forwarded to the marketing rep via WhatsApp (see lib/ai/domains/loonars-fee-transfer-confirmation.ts). Null means still awaiting proof, or proof was sent outside this flow.';
comment on column public.loonars_unit_fee_requests.transfer_confirmed_by is 'The Super Admin whose WhatsApp reply supplied the matched bukti transfer photo.';
comment on column public.loonars_unit_fee_requests.transfer_proof_url is 'Storage URL of the matched bukti transfer photo.';
