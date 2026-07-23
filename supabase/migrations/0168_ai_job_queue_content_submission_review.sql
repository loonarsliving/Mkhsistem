-- ============================================================================
-- MK Connect — 0168: ai_job_queue content_submission_review job type
--
-- Content Studio's AI review (reviewContentSubmission, lib/ai/domains/markom.ts)
-- normally runs synchronously inside the createContentSubmissionAction/
-- retryContentReviewAction server actions, which require a logged-in Markom
-- session. Content sourced from the KontenAI Render Engine (Drive-hosted
-- output, no browser upload involved) has no such session to run inside, so
-- it's queued through the existing ai_job_queue/process-job pipeline instead
-- -- same durable-retry machinery every other async AI workflow here uses,
-- just one more allowed job_type.
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check check (job_type in (
  'whatsapp_ai_reply',
  'crm_sp1_draft',
  'markom_checklist_draft',
  'meta_ads_launch',
  'meta_ads_research',
  'social_weekly_evaluation',
  'crm_sales_coaching',
  'loonars_beauty_weekly_evaluation',
  'knowledge_bank_refresh',
  'sales_closing_tips_broadcast',
  'leasehold_competitor_comparison',
  'competitor_discovery',
  'loonars_beauty_competitor_comparison',
  'loonars_beauty_content_ideas_draft',
  'investor_intelligence_refresh',
  'cashflow_intelligence_refresh',
  'sales_teaching_weekly',
  'cashflow_action_plan',
  'loonars_beauty_weekly_content_audit',
  'markom_content_performance_broadcast',
  'occupancy_intelligence_refresh',
  'occupancy_teaching_biweekly',
  'content_submission_review'
));
