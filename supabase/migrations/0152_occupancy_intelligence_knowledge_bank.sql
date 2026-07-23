-- ============================================================================
-- MK Connect — 0152: Occupancy Intelligence knowledge bank
--
-- Owner's ask: teach the AI about occupancy management for Management
-- Property (kos/kontrakan/villa managed on behalf of owners) -- how to
-- raise occupancy, how to win over property owners to hand over
-- management, and tourism-market data starting from Jogja. Same shape and
-- purpose as ai_investor_intelligence_bank (0126) / ai_cashflow_intelligence_bank
-- (0127): one row per topic, refreshed weekly via Gemini + Google Search
-- grounding (lib/ai/domains/occupancy-intelligence.ts), consumed only by
-- the Occupancy Teaching Engine (0153) -- never a chat system prompt,
-- never read by any UI.
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery',
    'loonars_beauty_competitor_comparison', 'loonars_beauty_content_ideas_draft',
    'investor_intelligence_refresh', 'cashflow_intelligence_refresh',
    'sales_teaching_weekly', 'cashflow_action_plan',
    'loonars_beauty_weekly_content_audit',
    'markom_content_performance_broadcast',
    -- This migration
    'occupancy_intelligence_refresh'
  ));

create table public.ai_occupancy_intelligence_bank (
  id uuid primary key default gen_random_uuid(),
  topic text not null unique,
  title text not null,
  content text not null,
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_occupancy_intelligence_bank is
  'Occupancy Intelligence knowledge bank for Management Property -- occupancy-improvement tactics, property-owner acquisition/deal-making, and tourism-city market data (Jogja-first). One row per topic, refreshed weekly. Service-role only (no RLS policies) -- consumed by the Occupancy Teaching Engine (0153), never a chat system prompt, never read by any UI.';

alter table public.ai_occupancy_intelligence_bank enable row level security;

create or replace function public.ai_run_occupancy_intelligence_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text;
  v_topics text[] := array[
    'occupancy_improvement_tactics',
    'property_owner_acquisition_deal',
    'tourism_city_market_data',
    'jogja_occupancy_market_deep_dive',
    'guest_retention_and_reviews',
    'dynamic_pricing_revenue_management',
    'owner_relationship_management'
  ];
begin
  foreach v_topic in array v_topics loop
    if not exists (
      select 1 from public.ai_job_queue
      where job_type = 'occupancy_intelligence_refresh'
        and status in ('pending', 'processing')
        and (payload ->> 'topic') = v_topic
    ) then
      insert into public.ai_job_queue (job_type, payload)
      values ('occupancy_intelligence_refresh', jsonb_build_object('topic', v_topic));
    end if;
  end loop;
end;
$$;

comment on function public.ai_run_occupancy_intelligence_dispatch is
  'Weekly: enqueues one occupancy_intelligence_refresh job per topic (7 total) to keep ai_occupancy_intelligence_bank fresh.';

-- Monday 02:20 UTC = 10:20 WITA -- same day as the other knowledge-bank
-- refreshes (0126 01:30 UTC, 0127 01:45 UTC, loonars-beauty-competitor-
-- comparison/markom-content-performance-broadcast at 02:00/02:10 UTC),
-- offset to avoid hammering Gemini simultaneously.
select cron.schedule('ai-occupancy-intelligence-weekly-refresh', '20 2 * * 1', $$select public.ai_run_occupancy_intelligence_dispatch();$$);
