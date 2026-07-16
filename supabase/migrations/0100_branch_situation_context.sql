-- ============================================================================
-- MK Connect — 0100: Branch-specific situation context for the AI advisory
--
-- A branch's saldo being below threshold doesn't always mean a cash crisis:
-- - Makassar has no project open yet -- its near-zero balance is expected,
--   not a shortfall. It needs a "please launch a project" nudge every 2
--   days, not a daily "your cash is low" warning.
-- - Jabodetabek has a project running but no sales/closing yet -- its
--   advisory goes to Direktur Operasional with a gentle, sales-focused tone
--   instead of the KUR/financing framing.
-- ============================================================================

alter table public.finance_branch_balances
  add column situation_type text not null default 'cash_low' check (situation_type in ('cash_low', 'no_project', 'no_sales')),
  add column situation_note text,
  add column reminder_interval_days int not null default 1;

comment on column public.finance_branch_balances.situation_type is
  'Why this branch is below its alert_threshold -- cash_low (real shortfall), no_project (branch hasn''t opened a project yet), or no_sales (project running, no closings yet). Drives which AI advisory prompt/tone/recipients app/api/ai/branch-balance-advisory uses.';
comment on column public.finance_branch_balances.situation_note is
  'Factual context fed into the AI prompt so the advisory is grounded in the real situation instead of a generic cash-shortfall message.';
comment on column public.finance_branch_balances.reminder_interval_days is
  'How often (in days) the AI advisory re-fires for this branch. Most branches are daily; Makassar''s project-launch nudge is every 2 days so it doesn''t feel like spam.';

update public.finance_branch_balances set
  situation_type = 'no_project',
  situation_note = 'Cabang Makassar belum memiliki proyek yang dibuka.',
  reminder_interval_days = 2
where branch_name = 'Makassar';

update public.finance_branch_balances set
  situation_type = 'no_sales',
  situation_note = 'Proyek Jabodetabek sudah berjalan namun belum ada penjualan/closing sejak dibuka.'
where branch_name = 'Jabodetabek';
