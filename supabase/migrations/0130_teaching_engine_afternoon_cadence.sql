-- ============================================================================
-- MK Connect — 0130: Push Sales/Cashflow Teaching Engine sends to Monday
-- siang, after the knowledge banks have actually run
--
-- 0128/0129 originally sent the first Weekly Coaching Sunday night (23:00
-- UTC / Monday 07:00 WITA) and ran the daily cashflow check at 02:00 UTC
-- (10:00 WITA) -- both BEFORE the Investor/Cashflow Intelligence weekly
-- refresh (0126/0127, Monday 01:30/01:45 UTC) has actually finished
-- researching. Owner's ask: Kepala Cabang should only start receiving these
-- WhatsApp messages once the knowledge bank behind them already has
-- meaningful content, not on the very first, still-empty run -- so push
-- both sends to Monday siang (13:00 WITA) instead, comfortably after the
-- knowledge bank refresh jobs have had time to complete.
-- ============================================================================

select cron.unschedule('crm-sales-teaching-weekly');
select cron.unschedule('finance-cashflow-teaching-daily');

-- Monday 05:00 UTC = 13:00 WITA -- well after the 01:30/01:45 UTC knowledge
-- bank refresh dispatch, giving those Gemini + Google Search jobs time to
-- actually finish before this reads from ai_investor_intelligence_bank.
select cron.schedule('crm-sales-teaching-weekly', '0 5 * * 1', $$select public.crm_run_sales_teaching_weekly();$$);

comment on function public.crm_run_sales_teaching_weekly is
  'Weekly (Monday 13:00 WITA, after the Investor Intelligence refresh has had time to complete): enqueues a sales_teaching_weekly job (branch-wide Weekly Coaching for Kepala Cabang -> generateWeeklySalesTeaching) for every branch with an active villa-leasehold project -- today, only Jogja. Delivered via WhatsApp only, never via mkc_notifications/UI.';

-- Daily 05:00 UTC = 13:00 WITA (was 02:00 UTC/10:00 WITA) -- same
-- afternoon slot every day, so the very first run doesn't fire before the
-- Cashflow Intelligence bank has any content.
select cron.schedule('finance-cashflow-teaching-daily', '0 5 * * *', $$select public.finance_run_cashflow_teaching_check();$$);

comment on function public.finance_run_cashflow_teaching_check is
  'Daily, 13:00 WITA: for every branch below its cashflow_teaching_threshold (today, only Jogja), enqueues a cashflow_action_plan job (-> generateCashflowActionPlan, grounded in the Cashflow Intelligence bank, 0127) -- root cause, risk level, and a concrete Action Plan for Kepala Cabang, delivered via WhatsApp only.';
