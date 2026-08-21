-- ============================================================================
-- MK Connect — 0238: Recap Vando-approved contractor reports to Super Admin
--
-- Owner's ask, before 0237/0027 go to production: once Vando approves a
-- contractor nota report (COCOK LAP-xxxx), Super Admin should also see it --
-- but as one tidy recap message, not a raw notification per report. Adds
-- recapped_at so the recap (sent from lib/ai/domains/contractor-expense-
-- report.ts's tryDecideContractorReport, right after an approval) can pick
-- up every approved-but-not-yet-recapped row and bundle them into a single
-- WhatsApp message to every Super Admin, then mark them all recapped_at =
-- now(). Left null on failure so a retry naturally includes it again --
-- nothing is ever silently dropped.
-- ============================================================================

alter table public.contractor_expense_reports
  add column recapped_at timestamptz;

comment on column public.contractor_expense_reports.recapped_at is
  'Set once this approved report has been included in a Super Admin recap WhatsApp message. NULL means still pending recap (either awaiting approval, or approved but not yet successfully recapped).';
