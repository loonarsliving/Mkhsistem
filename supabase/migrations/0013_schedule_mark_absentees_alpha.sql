-- Daily job that finalizes attendance for the day: any active employee with
-- a scheduled work day and no attendance row is marked 'alpha' (unexcused
-- absence). Runs at 10:00 UTC = 18:00 WITA (Asia/Makassar), an hour after
-- the default work_schedules.end_time of 17:00, so the day's check-ins have
-- had time to land before the cutoff. Both the UTC and WITA calendar dates
-- still agree at that instant (WITA only rolls to the next date at 16:00
-- UTC), so mark_absentees_alpha()'s default `current_date` resolves to the
-- correct business day in both zones.
select cron.schedule(
  'mark-absentees-alpha-daily',
  '0 10 * * *',
  $$select public.mark_absentees_alpha();$$
);
