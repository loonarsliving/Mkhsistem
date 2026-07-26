-- ============================================================================
-- MK Connect — 0180: the KontenAI dispatch schedule follows its own setting
--
-- Fixes T7 in docs/AUTOMATION.md.
--
-- `kontenai_automation_settings.enabled` has been false since 2026-07-23, but
-- `kontenai-automation-dispatch` kept running every 5 minutes anyway: 851
-- executions in the 7 days audited, every one of them entering
-- kontenai_automation_dispatch(), reading the disabled flag, and returning.
-- All 851 reported `succeeded`, which is why this never showed up as a
-- problem -- a job that does nothing perfectly looks exactly like a job that
-- works.
--
-- The obvious fix is `cron.unschedule` and move on. That is a trap: the toggle
-- that turns this feature on lives in the KontenAI UI, so the next person to
-- switch it back on would get a setting that says "enabled", no cron behind
-- it, and no error anywhere. The feature would simply not happen, and the
-- cause would be a migration written months earlier.
--
-- So the schedule is made a consequence of the setting rather than a second
-- thing that has to agree with it. Flipping `enabled` schedules or unschedules
-- the cron in the same transaction as the toggle. There is now exactly one
-- switch, and it is the one in the UI.
--
-- Not addressed here, because it is not in the database: the Railway render/Veo
-- worker containers still run 24/7. At the time of writing there are 2 render
-- jobs in the entire table, the most recent from 2026-07-23, and none pending
-- or processing -- so those containers are idle, not busy. Stopping them is a
-- Railway dashboard action, and it does trade away the ability to run a manual
-- render from the KontenAI pages until they are started again.
-- ============================================================================

create or replace function public.kontenai_automation_sync_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(new.enabled, false) then
    -- cron.schedule upserts by job name, so re-enabling twice is harmless.
    perform cron.schedule(
      'kontenai-automation-dispatch',
      '*/5 * * * *',
      $cmd$select public.kontenai_automation_dispatch();$cmd$
    );
  elsif exists (select 1 from cron.job where jobname = 'kontenai-automation-dispatch') then
    -- Guarded: cron.unschedule raises if the job is already gone, which would
    -- turn "save settings" into an error for the operator.
    perform cron.unschedule('kontenai-automation-dispatch');
  end if;

  return new;
end;
$$;

comment on function public.kontenai_automation_sync_schedule() is
  'Keeps the kontenai-automation-dispatch pg_cron job in step with kontenai_automation_settings.enabled, so the UI toggle is the only switch (T7, migration 0180).';

drop trigger if exists kontenai_automation_settings_sync_schedule on public.kontenai_automation_settings;
create trigger kontenai_automation_settings_sync_schedule
  after insert or update of enabled on public.kontenai_automation_settings
  for each row execute function public.kontenai_automation_sync_schedule();

-- Bring the current state into line: enabled is false today, so the cron goes.
-- Written as a conditional rather than a bare unschedule so this migration is
-- safe to run against an environment where the feature is legitimately on.
do $$
begin
  if not coalesce((select enabled from public.kontenai_automation_settings where id = 'singleton'), false)
     and exists (select 1 from cron.job where jobname = 'kontenai-automation-dispatch') then
    perform cron.unschedule('kontenai-automation-dispatch');
  end if;
end;
$$;
