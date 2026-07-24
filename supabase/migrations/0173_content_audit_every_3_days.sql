-- ============================================================================
-- MK Connect — 0171: Content Audit refreshed every 3 days instead of weekly
--
-- Owner's ask: the Content Audit page (both Leasehold and Beauty tabs) felt
-- stale only updating once a week. Both audits are upserted keyed by
-- week_start (social_weekly_evaluations / loonars_beauty_weekly_content_audits,
-- unique on week_start) -- re-running mid-week just recomputes and overwrites
-- that same week's row with fresher numbers, it doesn't create a second row.
-- So this is a pure cadence change (cron.schedule with the same job name
-- reschedules it, same pattern as 0130's teaching-engine cadence change) --
-- no schema or UI change needed.
-- ============================================================================

select cron.schedule('social-weekly-evaluation-dispatch', '0 1 */3 * *', $$select public.social_run_weekly_evaluation_dispatch();$$);
select cron.schedule('loonars-beauty-weekly-content-audit-dispatch', '50 1 */3 * *', $$select public.loonars_beauty_run_weekly_content_audit_dispatch();$$);
