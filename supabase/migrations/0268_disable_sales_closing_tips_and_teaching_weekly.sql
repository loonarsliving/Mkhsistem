-- ============================================================================
-- MK Connect — 0268: Turn off sales closing-tips broadcast (Sales) and
-- Sales Teaching Engine weekly briefing (Kepala Cabang)
--
-- Owner's ask: "Matikan tips closing dan tips2 untuk sales dan kepala
-- cabang" -- stop both WhatsApp broadcasts:
--   - crm-sales-closing-tips-2x-weekly (0118) -> crm_dispatch_sales_closing_tips
--     (0117), personalized closing tip per active Sales employee.
--   - crm-sales-teaching-weekly (0128, retimed by 0130) ->
--     crm_run_sales_teaching_weekly (0128), branch-wide Weekly Coaching
--     for Kepala Cabang.
--
-- Unschedule only, per this project's pattern of never deleting working
-- functionality without explicit approval to go further -- the underlying
-- functions, job types, and log table stay intact so either broadcast can
-- be re-enabled later (a future migration re-adding the cron.schedule
-- call) or dispatched manually by calling the function directly.
-- ============================================================================

select cron.unschedule('crm-sales-closing-tips-2x-weekly');
select cron.unschedule('crm-sales-teaching-weekly');
