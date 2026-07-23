-- ============================================================================
-- MK Connect — 0118: Schedule sales closing-tips broadcast, 2x/week
--
-- crm_dispatch_sales_closing_tips() (0117) was manual-only. Owner asked for
-- it automatically 2x/week -- Sunday (weekend motivation, the original
-- ask) and Wednesday (midweek boost), 08:00 WITA (00:00 UTC).
-- ============================================================================

select cron.schedule('crm-sales-closing-tips-2x-weekly', '0 0 * * 0,3', $$select public.crm_dispatch_sales_closing_tips();$$);
