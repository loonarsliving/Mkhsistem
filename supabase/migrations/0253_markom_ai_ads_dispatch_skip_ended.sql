-- ============================================================================
-- MK Connect — 0253: Stop the AI Ads dispatch from re-launching a project
-- Markom has already dealt with
--
-- Bug: markom_run_ai_ads_dispatch() (migration 0081) only skipped a project
-- if it had a meta_ad_campaigns row created in the last 7 days. Once a
-- human paused an ad and left it paused for more than a week, the project
-- became "due" again and the next Monday's dispatch researched + launched
-- a brand new ad for it (processMetaAdsLaunch inserts status = 'active'
-- directly, no draft/review step) -- from Markom's side this looked
-- exactly like a paused ad "reactivating itself".
--
-- Fix: also permanently skip a project once it has ANY campaign row that
-- is still 'active', 'paused', or has been explicitly marked 'ended' by a
-- human (see endAdCampaignAction) -- regardless of how old that row is.
-- The 7-day cooldown on 'draft'/'failed' rows is kept as-is so a fresh
-- research/launch attempt still isn't re-queued the very next day.
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
        where c.project_id = p.id
          and (c.status in ('active', 'paused', 'ended') or c.created_at >= now() - interval '7 days')
      )
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('meta_ads_launch', jsonb_build_object('project_id', v_project.project_id, 'branch_id', v_project.branch_id));
  end loop;
end;
$$;
