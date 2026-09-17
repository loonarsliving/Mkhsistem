-- ============================================================================
-- MK Connect — 0271: Loonars AI Occupancy Ads — weekly budget ceiling
--
-- NOT YET APPLIED TO THE LIVE DATABASE at commit time -- same approval
-- gate as 0268/0269/0270 (root CLAUDE.md: never change database schema
-- without approval). Written for review only.
--
-- Adds an optional per-property weekly spend ceiling alongside the
-- existing daily ceiling (max_daily_budget_idr). Nullable/0 = no separate
-- weekly cap, only the daily cap applies (backward compatible with every
-- existing target row). When set, the launch action
-- (features/occupancy-ads/actions/occupancy-ads.actions.ts) refuses to
-- launch a campaign if this property's already-committed daily budgets
-- from campaigns 'active' this ISO week, plus the new campaign's own
-- daily budget, would exceed it -- enforced in code
-- (lib/occupancy/campaign-rules.ts's checkWeeklyBudgetCeiling), never by
-- the AI.
-- ============================================================================

alter table public.loonars_occupancy_targets
  add column if not exists max_weekly_budget_idr integer check (max_weekly_budget_idr >= 0);
