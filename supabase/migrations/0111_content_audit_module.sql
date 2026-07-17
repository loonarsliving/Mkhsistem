-- ============================================================================
-- MK Connect — 0111: Content Audit module (weekly IG/TikTok scored audit)
--
-- Upgrades the existing weekly social evaluation (0085/0086 --
-- social_weekly_evaluations, populated by social_run_weekly_evaluation_dispatch
-- every Monday) from a plain narrative into a structured, scored audit --
-- reuses the same table/cadence/cron rather than standing up a parallel
-- pipeline that would just re-fetch the same Instagram data a second time
-- in the same week. `evaluation` stays as the narrative summary (unchanged
-- shape, so nothing that already reads it breaks); `audit` is the new
-- structured result: content-audit-scoring rubric (hook/value/CTA/niche
-- fit/engagement potential/platform optimization, each 1-10 + overall),
-- growth signal vs Instagram's own algorithm benchmarks, best/worst real
-- post of the week with reasoning, and next-week recommendations -- see
-- auditWeeklyContentPerformance, lib/ai/domains/markom.ts.
-- ============================================================================

alter table public.social_weekly_evaluations add column if not exists audit jsonb;
