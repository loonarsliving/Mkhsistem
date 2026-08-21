-- ============================================================================
-- MK Connect — 0239: Store the per-item breakdown on contractor reports
--
-- Owner's feedback after trying the feature: the AI was collapsing every
-- line on the nota into one combined description with a single price. Adds
-- `items` (jsonb array of {nama, harga}) so the per-line breakdown Gemini
-- now reads (expense-receipt-recognition.ts) survives alongside the
-- existing `item` summary text (kept for backward compatibility with the
-- recap/report formatting that already reads it as a fallback).
-- ============================================================================

alter table public.contractor_expense_reports
  add column items jsonb not null default '[]'::jsonb;

comment on column public.contractor_expense_reports.items is
  'Per-line item breakdown read off the nota photo: [{"nama": "...", "harga": 0}, ...]. `item` stays as the human-readable joined summary of the same data.';
