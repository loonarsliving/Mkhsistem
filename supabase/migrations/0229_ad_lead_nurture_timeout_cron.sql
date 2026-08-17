-- ============================================================================
-- MK Connect — 0229: pending_questions timeout sweep (pg_cron)
--
-- Every 5 minutes, pings /api/ai/lead-pending-question-timeout (via the
-- shared automation_post() dispatcher, 0176) to catch any pending_questions
-- row still 'waiting' more than 20 minutes after being sent to Super Admin
-- -- see that route's doc for what it does (extra holding message to the
-- lead + backup escalation to the branch's Kepala Cabang).
-- ============================================================================

select cron.schedule(
  'ad-lead-pending-question-timeout-sweep',
  '*/5 * * * *',
  $$select public.automation_post('/api/ai/lead-pending-question-timeout');$$
);
