-- ============================================================================
-- MK Connect — 0082: Split Ads Specialist "Riset" and "Luncurkan" into two steps
--
-- Bug found: the manual "Riset & Luncurkan" button on /markom/ads called
-- enqueueAdsLaunchJob(), which did a plain authenticated-client insert into
-- ai_job_queue. That table's RLS (0065) has NO policy for `authenticated`
-- at all -- every other job insert in this codebase goes through a
-- SECURITY DEFINER function (the pg_cron dispatchers), which bypasses RLS
-- as the table owner. The manual button was the only place that tried a
-- direct client-side insert, so it silently failed RLS every time --
-- that's why meta_ad_campaigns had zero rows and ai_job_queue had zero
-- meta_ads_launch jobs despite the button reporting an error.
--
-- Also implements the requested UX change: the manual path now researches
-- first (meta_ads_research job -> a 'draft' row Markom can review as a
-- reference) and launches as a separate, explicit second step
-- (launchDraftCampaignAction, a direct Meta API call from the saved draft,
-- no new Gemini call). The fully-autonomous weekly cron
-- (markom_run_ai_ads_dispatch, 0081) is unchanged -- it still enqueues
-- 'meta_ads_launch' as one atomic research+launch job, per the user's
-- explicit "no human approval needed" authorization for that path.
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in ('whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft', 'meta_ads_launch', 'meta_ads_research'));

alter table public.meta_ad_campaigns drop constraint meta_ad_campaigns_status_check;
alter table public.meta_ad_campaigns add constraint meta_ad_campaigns_status_check
  check (status in ('draft', 'active', 'paused', 'ended', 'failed'));

-- The one narrow, permission-checked entry point a human can use to enqueue
-- a research job -- mirrors how every other ai_job_queue insert in this
-- codebase already goes through a SECURITY DEFINER function.
create or replace function public.markom_request_ads_research(p_project_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('ad_campaign.manage') then
    raise exception 'permission denied';
  end if;

  insert into public.ai_job_queue (job_type, payload)
  values ('meta_ads_research', jsonb_build_object('project_id', p_project_id, 'branch_id', p_branch_id));
end;
$$;

grant execute on function public.markom_request_ads_research(uuid, uuid) to authenticated;
