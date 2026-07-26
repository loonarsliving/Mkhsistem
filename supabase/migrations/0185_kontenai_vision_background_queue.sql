-- ============================================================================
-- MK Connect — 0185: Gemini Vision runs in the background instead of by hand
--
-- Vision analysis is the input AI Director reasons over: assetContext in
-- generateCreativeBrief is built entirely from ai_description/ai_tags/
-- ai_category/ai_mood. An asset the system has never "seen" contributes
-- nothing to a brief, so unanalyzed footage silently caps content quality no
-- matter how detailed the brief prompt is (0184).
--
-- Production state that prompted this: 32 assets, 28 unanalyzed. All 32 are
-- storage_provider='google_drive'. Three reasons, all structural:
--
--   1. Analysis only ever ran on browser upload. The Drive sync path imports
--      rows without triggering it, and Drive is how every asset arrived.
--   2. Vision had no ai_job_queue job_type and no cron -- alone among the
--      AI features in this system. Nothing swept for unanalyzed assets.
--   3. The "Analisis Semua" button is a prototype backed by
--      features/kontenai/lib/mock-db.ts. It writes deterministic fake text
--      ("Analisis Gemini Vision (mock) untuk ...") into an in-memory store and
--      never touches kontenai_assets, so it looked like it worked.
--
-- The only path that did real work was the per-asset "Analyze Again" button,
-- i.e. 28 manual clicks.
--
-- Fix: give Vision the same durable queue every other AI workflow here uses.
-- The sweep is deliberately the single entry point rather than hooking the
-- Drive importer: it catches assets however they arrived -- Drive sync, browser
-- upload whose inline attempt failed, or rows created by some future path
-- nobody has written yet.
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
  'zernio_publish_reconcile',
  'friday_executive_briefing',
  'friday_holding_briefing',
  -- This migration
  'kontenai_asset_vision'
));

-- ----------------------------------------------------------------------------
-- kontenai_vision_dispatch_pending: enqueue Vision analysis for assets that
-- have never been analyzed.
--
-- Only 'not_analyzed' is picked up, never 'failed'. A file that genuinely
-- cannot be decoded would otherwise be re-queued forever, burning Gemini
-- calls on every sweep; failures stay visible in the Asset Library for a
-- human to retry with the per-asset button.
--
-- Batch of 3 per tick is deliberately small. One video analysis is up to
-- eight separate Gemini vision calls (one per extracted keyframe), so a
-- 30-video backlog is ~240 calls -- draining that as fast as possible would
-- trip the shared ai_circuit_breaker_state and take every other AI feature
-- down with it. Three per 5 minutes is ~36 assets/hour, which clears a
-- week's footage overnight without ever spiking.
-- ----------------------------------------------------------------------------
create or replace function public.kontenai_vision_dispatch_pending()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
  v_in_flight int;
  v_slots int;
begin
  -- Global in-flight cap, not just a per-tick batch. Without this the sweep
  -- adds 3 more every 5 minutes regardless of how many are still unprocessed:
  -- video analysis can take minutes per asset, so a slow drain would let the
  -- queue grow without bound and then fire all of it at Gemini at once.
  select count(*) into v_in_flight
  from public.ai_job_queue
  where job_type = 'kontenai_asset_vision' and status in ('pending', 'processing');

  v_slots := 3 - coalesce(v_in_flight, 0);
  if v_slots <= 0 then
    return;
  end if;

  for v_row in
    select a.id
    from public.kontenai_assets a
    where a.deleted_at is null
      and a.ai_vision_status = 'not_analyzed'
      and a.asset_type in ('image', 'video')
      and not exists (
        select 1 from public.ai_job_queue q
        where q.job_type = 'kontenai_asset_vision'
          and q.status in ('pending', 'processing')
          and (q.payload ->> 'asset_id') = a.id::text
      )
    order by a.created_at
    limit v_slots
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('kontenai_asset_vision', jsonb_build_object('asset_id', v_row.id));
  end loop;
end;
$$;

comment on function public.kontenai_vision_dispatch_pending is
  'Every 5 minutes: tops the Vision queue back up to at most 3 in-flight jobs (not +3 per tick -- see the in-flight cap). The single entry point for Vision, so it catches assets regardless of how they arrived (Drive sync, upload, future paths). Skips ai_vision_status=''failed'' so an undecodable file cannot loop.';

select cron.schedule('kontenai-vision-dispatch-pending', '*/5 * * * *',
  $$select public.kontenai_vision_dispatch_pending();$$);
