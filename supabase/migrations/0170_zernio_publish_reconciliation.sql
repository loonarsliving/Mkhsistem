-- ============================================================================
-- MK Connect — 0170: Zernio publish status reconciliation
--
-- markContentPublishedViaZernio (app/api/social/publish-content) flips a
-- submission to 'published' the instant Zernio's createPost call is
-- *accepted*, but Zernio's own per-platform status (pending/publishing/
-- published/failed) and platformPostUrl often aren't final at that point --
-- Instagram/TikTok still have to actually finish processing the post. A
-- submission could sit at status='published' in our DB for many minutes
-- while Zernio itself still says 'processing' and has no permalink yet, with
-- nothing ever checking back.
--
-- markom_reconcile_zernio_publish_status (pg_cron, every 5 minutes) finds
-- 'published' submissions whose zernio_publish_status isn't the terminal
-- 'published' value yet, within a 6-hour window (long enough for any real
-- processing delay; past that, a human should look at it directly instead of
-- polling forever), and re-checks each via zernio_publish_reconcile.
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check check (job_type in (
  'whatsapp_ai_reply',
  'crm_sp1_draft',
  'markom_checklist_draft',
  'meta_ads_launch',
  'meta_ads_research',
  'social_weekly_evaluation',
  'crm_sales_coaching',
  'loonars_beauty_weekly_evaluation',
  'knowledge_bank_refresh',
  'sales_closing_tips_broadcast',
  'leasehold_competitor_comparison',
  'competitor_discovery',
  'loonars_beauty_competitor_comparison',
  'loonars_beauty_content_ideas_draft',
  'investor_intelligence_refresh',
  'cashflow_intelligence_refresh',
  'sales_teaching_weekly',
  'cashflow_action_plan',
  'loonars_beauty_weekly_content_audit',
  'markom_content_performance_broadcast',
  'occupancy_intelligence_refresh',
  'occupancy_teaching_biweekly',
  'content_submission_review',
  'kontenai_auto_produce',
  'kontenai_auto_bridge_to_studio',
  'zernio_publish_reconcile'
));

create or replace function public.markom_reconcile_zernio_publish_status()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
begin
  for v_row in
    select id
    from public.markom_content_submissions
    where status = 'published'
      and zernio_post_id is not null
      and coalesce(zernio_publish_status, 'pending') <> 'published'
      and published_at >= now() - interval '6 hours'
    order by published_at
    limit 20
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('zernio_publish_reconcile', jsonb_build_object('submission_id', v_row.id));
  end loop;
end;
$$;

grant execute on function public.markom_reconcile_zernio_publish_status() to service_role;

select cron.schedule('markom-reconcile-zernio-publish-status', '*/5 * * * *', $$select public.markom_reconcile_zernio_publish_status();$$);
