-- ============================================================================
-- MK Connect — 0086: Content Planner automation (snapshot capture + weekly eval)
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation'
  ));

-- Enqueues the weekly evaluation job -- the actual Gemini call + write
-- happens in app/api/ai/process-job/route.ts's processSocialWeeklyEvaluation,
-- same async job-queue pattern as every other AI workflow in this app.
create or replace function public.social_run_weekly_evaluation_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_job_queue (job_type, payload) values ('social_weekly_evaluation', '{}'::jsonb);
end;
$$;

-- Monday 01:00 UTC = 09:00 WITA -- after the daily snapshot capture below has run for the day.
select cron.schedule('social-weekly-evaluation-dispatch', '0 1 * * 1', $$select public.social_run_weekly_evaluation_dispatch();$$);

-- Daily own-account performance capture -- a plain API read + DB insert per
-- platform (no Gemini call, no retry/backoff needed), so unlike the AI
-- workflows this calls its own lightweight service route directly via
-- net.http_post rather than going through ai_job_queue. Same pattern as
-- mkc_notifications_whatsapp_trigger's relay call.
select cron.schedule(
  'social-daily-snapshot-capture',
  '0 23 * * *', -- 23:00 UTC = 07:00 WITA next day, before the work day starts
  $$
  select net.http_post(
    url := 'https://mkh.haluoleo.id/api/social/capture-snapshots',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
