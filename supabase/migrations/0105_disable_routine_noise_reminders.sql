-- ============================================================================
-- MK Connect — 0105: Disable routine low-value WhatsApp broadcasts
--
-- User feedback: too many routine messages (daily "good morning" quote,
-- morning check-in reminder, evening checkout reminder) were causing
-- employees to tune out and ignore system WhatsApp messages generally --
-- including the ones that actually matter (sales targets, leads, alerts).
--
-- Disabled (not deleted) so they're trivially reversible if wanted back:
--   - ai-daily-motivation: Mon-Fri 07:00 WITA rotating motivational quote
--     to every active employee (0071_general_daily_automation.sql).
--   - attendance-checkin-reminder-daily: Mon-Fri 07:30 WITA "don't forget
--     to check in" reminder to everyone (original attendance module).
--   - attendance-forgot-checkout-daily: daily 17:00 WITA "you forgot to
--     check out" reminder to everyone (original attendance module).
--
-- mark-absentees-alpha-daily is intentionally left untouched -- it's a
-- silent data-bookkeeping job (marks missing attendance rows as 'alpha'),
-- never sends a WhatsApp message, and other features (KPI digests,
-- attendance reports) depend on its output being accurate.
-- ============================================================================

select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'ai-daily-motivation'), active := false);
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'attendance-checkin-reminder-daily'), active := false);
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'attendance-forgot-checkout-daily'), active := false);
