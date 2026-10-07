-- ============================================================================
-- MK Connect — Keep one month of pg_cron run history
-- ============================================================================
-- cron.job_run_details keeps one row per cron run forever. With ~70 active
-- jobs (several every minute) it had grown to ~540k rows / 121 MB since
-- 2026-07, almost half of the shared database's size. Nothing reads it
-- (automation_dispatch_log is the real dispatch-outcome record, see 0176);
-- it is only useful for recent debugging, so keep one month.
--
-- The prune runs daily rather than monthly so each run only deletes about
-- a day's worth of rows: a single delete of the 330k-row backlog did not
-- finish inside the statement timeout. Freed space is reused by new rows
-- via autovacuum rather than returned to the OS.
--
-- The backlog itself is cleared by a self-unscheduling catch-up job that
-- deletes 20k rows per minute (applied live 2026-10-07).

select cron.schedule(
  'prune-cron-history-daily',
  '30 3 * * *',
  $$delete from cron.job_run_details where start_time < now() - interval '1 month';$$
);

select cron.schedule('prune-cron-history-catchup', '* * * * *', $job$
do $$
begin
  delete from cron.job_run_details where runid in (
    select runid from cron.job_run_details
    where start_time < now() - interval '1 month'
    order by runid limit 20000);
  if not exists (select 1 from cron.job_run_details where start_time < now() - interval '1 month') then
    perform cron.unschedule('prune-cron-history-catchup');
  end if;
end $$;
$job$);
