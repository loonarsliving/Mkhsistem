-- ============================================================================
-- MK Connect — 0131: Restore job types clobbered by a concurrent migration race
--
-- Two Claude sessions worked on this branch at the same time. The other
-- session's migrations (applied as 0126_investor_intelligence_knowledge_bank
-- through 0129_cashflow_teaching_engine_action_plan, DB timestamps
-- 20260719104410-104516) each did a drop-and-recreate of
-- ai_job_queue_job_type_check, progressively adding investor_intelligence_
-- refresh, cashflow_intelligence_refresh, sales_teaching_weekly, and
-- cashflow_action_plan.
--
-- This session's 0126_loonars_beauty_zernio_pipeline (DB timestamp
-- 20260719104707, applied directly to the live DB, chronologically AFTER
-- all four of those) also did a drop-and-recreate of the same constraint,
-- built from a list queried before the other session's job types existed
-- -- so it silently dropped all four. Confirmed via job history
-- (cron.job_run_details) that none of the affected crons had fired yet, so
-- no job ever failed silently -- caught before any real impact, restoring
-- the full merged list here.
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery',
    'loonars_beauty_competitor_comparison', 'loonars_beauty_content_ideas_draft',
    'investor_intelligence_refresh', 'cashflow_intelligence_refresh',
    'sales_teaching_weekly', 'cashflow_action_plan'
  ));
