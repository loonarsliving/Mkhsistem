-- ============================================================================
-- MK Connect — 0187: beauty is actually in the automated pipeline now
--
-- 0184 scoped KontenAI to villa (occupancy) + beauty by adding 'beauty' to
-- kontenai_automation_dispatch's content_focus filter. That branch can never
-- match: kpi_tasks.content_focus is constrained to
-- ('leasehold_sales','occupancy','general') by 0123, and nothing in the system
-- creates a beauty kpi_task. Beauty content lives in loonars_content_items --
-- a different table, drafted daily by loonars_beauty_content_ideas_draft, with
-- no task, branch or division attached.
--
-- So the state before this migration was: villa automated end to end, beauty
-- automated in name only and reachable exclusively by a human clicking "Kirim
-- ke KontenAI" on each item. Flipping the toggle next week would have produced
-- villa videos and nothing else.
--
-- This gives beauty its own dispatch, keyed on the row beauty content actually
-- lives in. The chain it triggers is identical to villa's (AI Director ->
-- Storyboard Engine -> footage analysis + Asset Selector -> render job) and is
-- the same code the manual button runs, so the toggle changes who starts a run,
-- not what a run does.
--
-- Where the two lanes deliberately differ: villa continues into Content Studio
-- (kontenai_auto_bridge_to_studio) because its kpi_task supplies a branch, a
-- division and a Kepala Cabang to verify it. A beauty item has none of those,
-- so beauty stops at the finished render, which appears on the Loonars Beauty
-- board against the item that produced it. Who reviews and publishes a beauty
-- video is a decision for the owner, not something to infer here.
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
  -- Kept only because 0186's dead-lettered rows still reference it; nothing
  -- produces it. See 0186.
  'kontenai_asset_vision',
  -- This migration
  'kontenai_auto_produce_beauty'
));

-- ----------------------------------------------------------------------------
-- kontenai_automation_dispatch: villa from kpi_tasks, beauty from
-- loonars_content_items, and the Content Studio bridge unchanged.
--
-- Restated from 0184. The occupancy loop drops the unreachable 'beauty' from
-- its filter (kpi_tasks cannot hold it), a beauty loop is added, and the
-- bridge loop is copied verbatim.
-- ----------------------------------------------------------------------------
create or replace function public.kontenai_automation_dispatch()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enabled boolean;
  v_row record;
begin
  select enabled into v_enabled from public.kontenai_automation_settings where id = 'singleton';
  if not coalesce(v_enabled, false) then
    return;
  end if;

  -- Villa. 'occupancy' is the only automated focus kpi_tasks can carry:
  -- 'leasehold_sales' is Markom's manual lane (0184) and 'general' is not
  -- content work.
  for v_row in
    select t.id
    from public.kpi_tasks t
    where t.status = 'pending'
      and t.deleted_at is null
      and t.content_focus = 'occupancy'
      and not exists (select 1 from public.kontenai_creative_briefs b where b.kpi_task_id = t.id)
    order by t.created_at
    limit 5
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('kontenai_auto_produce', jsonb_build_object('kpi_task_id', v_row.id));
  end loop;

  -- Beauty. One job per content item that has not been through KontenAI yet.
  -- kontenai_creative_brief_id is the marker the manual button already sets, so
  -- an item a human sent by hand is never picked up twice, and the in-flight
  -- check keeps a slow run from being queued again on the next tick.
  --
  -- Limit 2, against villa's 5: a beauty run analyzes up to 8 pieces of footage
  -- with Gemini Vision before it renders, and every AI feature in this system
  -- shares one circuit breaker.
  for v_row in
    select ci.id
    from public.loonars_content_items ci
    where ci.deleted_at is null
      and ci.kontenai_creative_brief_id is null
      and ci.status in ('idea', 'draft')
      and not exists (
        select 1 from public.ai_job_queue q
        where q.job_type = 'kontenai_auto_produce_beauty'
          and q.status in ('pending', 'processing')
          and (q.payload ->> 'content_item_id') = ci.id::text
      )
    order by ci.created_at
    limit 2
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('kontenai_auto_produce_beauty', jsonb_build_object('content_item_id', v_row.id));
  end loop;

  -- Content Studio bridge: villa only, by construction -- it joins through
  -- kpi_task_id, which beauty briefs do not have.
  for v_row in
    select rj.id
    from public.kontenai_render_jobs rj
    join public.kontenai_storyboards sb on sb.id = rj.storyboard_id
    join public.kontenai_creative_briefs b on b.id = sb.creative_brief_id
    where rj.status = 'completed'
      and b.kpi_task_id is not null
      and not exists (
        select 1 from public.markom_content_submissions s
        where s.task_id = b.kpi_task_id and s.deleted_at is null
      )
    order by rj.completed_at
    limit 5
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('kontenai_auto_bridge_to_studio', jsonb_build_object('render_job_id', v_row.id));
  end loop;
end;
$$;

comment on function public.kontenai_automation_dispatch is
  'Every tick while kontenai_automation_settings.enabled: queues villa production from pending occupancy kpi_tasks, beauty production from loonars_content_items that have not been to KontenAI yet (0187 -- the 0184 beauty branch was unreachable, kpi_tasks.content_focus cannot hold ''beauty''), and bridges completed villa renders into Content Studio.';
