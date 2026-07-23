-- ============================================================================
-- MK Connect — 0138: More frequent Markom checklist reminders + twice-weekly
-- Instagram/TikTok performance broadcast (with reprimand when below
-- benchmark)
--
-- Owner's ask: (1) remind Markom about unfinished checklist items more
-- often than the current once-a-day cadence, and (2) twice a week, send the
-- Markom team their Instagram/TikTok content score via WhatsApp -- and if
-- it's still low, deliver an explicit reprimand about that performance.
--
-- 1. markom_notify_kepala_cabang_pending() (0087/0137) already reminds both
--    Kepala Cabang and the Markom team about pending checklist items, once
--    daily (03:30 UTC / 11:30 WITA). No logic change needed -- just fire it
--    again at a second time each day (06:30 UTC / 14:30 WITA) so a task
--    still open at midday gets a same-day second nudge instead of waiting
--    until the next morning.
--
-- 2. New markom_content_performance_broadcast job, twice a week (Monday +
--    Thursday). Deliberately reuses the ALREADY-COMPUTED
--    social_weekly_evaluations row (the weekly content audit,
--    auditWeeklyContentPerformance -- Monday 09:00 WITA cron,
--    0086_content_planner_automation.sql) instead of firing its own extra
--    Gemini/Google Search call -- Monday's send reports that week's fresh
--    audit, Thursday's send is a mid-week repeat of the same (still
--    current) score, since the underlying account data doesn't
--    meaningfully change more than weekly. The message itself becomes an
--    explicit teguran (reprimand) when the audit's own growthSignal is
--    'below_benchmark' -- a real AI-assessed verdict, not a hardcoded
--    number picked here.
-- ============================================================================

-- Second daily firing, 06:30 UTC = 14:30 WITA (existing cron already covers
-- 11:30 WITA) -- same function, no logic change.
select cron.schedule('markom-checklist-reminder-afternoon', '30 6 * * *', $$select public.markom_notify_kepala_cabang_pending();$$);

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery',
    'loonars_beauty_competitor_comparison', 'loonars_beauty_content_ideas_draft',
    'investor_intelligence_refresh', 'cashflow_intelligence_refresh',
    'sales_teaching_weekly', 'cashflow_action_plan',
    'loonars_beauty_weekly_content_audit',
    -- This migration
    'markom_content_performance_broadcast'
  ));

create or replace function public.markom_run_content_performance_broadcast_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_job_queue (job_type, payload) values ('markom_content_performance_broadcast', '{}'::jsonb);
end;
$$;

comment on function public.markom_run_content_performance_broadcast_dispatch is
  'Twice a week: enqueues a markom_content_performance_broadcast job (-> processMarkomContentPerformanceBroadcast, process-job/route.ts) that reports the latest social_weekly_evaluations content audit score to every active Markom employee via WhatsApp -- an explicit reprimand when growthSignal is below_benchmark, a neutral report otherwise.';

-- Monday 02:10 UTC = 10:10 WITA -- an hour after the weekly content audit
-- (09:00 WITA dispatch, 0086) has had time to finish, so Monday's send
-- reports that week's fresh score.
select cron.schedule('markom-content-performance-broadcast-monday', '10 2 * * 1', $$select public.markom_run_content_performance_broadcast_dispatch();$$);

-- Thursday 02:10 UTC = 10:10 WITA -- mid-week repeat of the same week's
-- score (no new audit runs on Thursday), per the owner's ask for a
-- twice-weekly cadence.
select cron.schedule('markom-content-performance-broadcast-thursday', '10 2 * * 4', $$select public.markom_run_content_performance_broadcast_dispatch();$$);
