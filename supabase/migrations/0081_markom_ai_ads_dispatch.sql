-- ============================================================================
-- MK Connect — 0081: Autonomous Ads Specialist dispatch
--
-- Weekly: for each 'selling'-status crm_projects row that (a) has at least
-- one real photo uploaded (crm_project_photos, migration 0078) and (b)
-- hasn't had a meta_ad_campaigns launch attempt in the last 7 days,
-- enqueue a meta_ads_launch job. Pure SQL, no Gemini call here -- this
-- function only decides WHICH projects are due; the job handler
-- (app/api/ai/process-job/route.ts, processMetaAdsLaunch) does the actual
-- research (Gemini) and Meta API calls.
--
-- Real-spend safety: the job handler refuses to launch anything unless
-- META_ADS_DAILY_BUDGET_CAP_IDR is set (lib/meta/ads.ts
-- getRemainingDailyBudgetIdr) -- this cron can enqueue jobs freely, they
-- simply dead-letter as non-retryable until an operator sets that env var,
-- so it's safe to ship enabled by default.
-- ============================================================================

create or replace function public.markom_run_ai_ads_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
begin
  for v_project in
    select p.id as project_id, p.branch_id
    from public.crm_projects p
    where p.is_active = true and p.status = 'selling'
      and exists (select 1 from public.crm_project_photos ph where ph.project_id = p.id and ph.deleted_at is null)
      and not exists (
        select 1 from public.meta_ad_campaigns c
        where c.project_id = p.id and c.created_at >= now() - interval '7 days'
      )
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('meta_ads_launch', jsonb_build_object('project_id', v_project.project_id, 'branch_id', v_project.branch_id));
  end loop;
end;
$$;

-- Every Monday, 00:00 UTC = 08:00 WITA.
select cron.schedule('markom-ai-ads-dispatch-weekly', '0 0 * * 1', $$select public.markom_run_ai_ads_dispatch();$$);
