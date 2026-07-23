-- ============================================================================
-- MK Connect — 0126: AI Knowledge & Teaching Engine (1/4) — Investor
-- Intelligence knowledge bank
--
-- Owner's ask: Gemini should continuously study the real target market for
-- villa leasehold investment (Jogja/Loonars Living's only leasehold
-- product) -- investor behavior, decision patterns, trust/distrust drivers,
-- objections, closing drivers, relationship-building -- and turn that into
-- a distilled Knowledge Bank the AI can draw on when coaching Kepala Cabang
-- Jogja (see 0128, Sales Teaching Engine).
--
-- Deliberately a NEW, separate table from ai_knowledge_bank (0115/0116/0117)
-- rather than more rows/topics in it: ai_knowledge_bank is general
-- property/marketing platform knowledge shared by the markom/crm chat
-- prompts across ALL branches and both product lines. This bank is
-- investor-psychology knowledge specific to villa leasehold investors --
-- a different kind of content (behavioral/sales psychology, not market/
-- platform facts) consumed by a different, no-UI, WhatsApp-only pipeline,
-- never by the chat system prompts. Keeping it separate avoids diluting
-- ai_knowledge_bank's existing product_line semantics and its 5-minute
-- context-cache reader.
--
-- Same dispatch shape as ai_run_knowledge_bank_dispatch (0115): one job per
-- topic so one topic's research failing never blocks the others. Service-
-- role only, no UI ever reads this table directly (per owner's explicit
-- ask that this whole module stays invisible in the app -- arahan hanya
-- lewat WhatsApp, see 0128/0129).
-- ============================================================================

create table public.ai_investor_intelligence_bank (
  id uuid primary key default gen_random_uuid(),
  topic text not null unique,
  title text not null,
  content text not null,
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_investor_intelligence_bank is
  'Distilled investor-psychology knowledge for villa leasehold sales (behavior, decision patterns, trust drivers, objections, closing drivers, relationship-building), refreshed weekly via Gemini + Google Search grounding. Feeds the Sales Teaching Engine (crm_sales_teaching_log / sales_teaching_weekly job, 0128) -- never read by any chat prompt or UI.';

alter table public.ai_investor_intelligence_bank enable row level security;

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery',
    -- This migration
    'investor_intelligence_refresh'
  ));

create or replace function public.ai_run_investor_intelligence_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text;
  v_topics text[] := array[
    'investor_menengah_behavior', 'villa_leasehold_investor_behavior', 'investment_decision_pattern',
    'investor_trust_factors', 'investor_rejection_reasons', 'closing_drivers',
    'trust_building_technique', 'investor_long_term_relationship'
  ];
begin
  foreach v_topic in array v_topics loop
    insert into public.ai_job_queue (job_type, payload)
    values ('investor_intelligence_refresh', jsonb_build_object('topic', v_topic));
  end loop;
end;
$$;

comment on function public.ai_run_investor_intelligence_dispatch is
  'Enqueues one investor_intelligence_refresh job per topic -- each job does its own Gemini + Google Search call and upserts ai_investor_intelligence_bank, isolated so one topic failing does not block the others.';

-- Weekly, Monday 01:30 UTC (09:30 WITA) -- ahead of the Monday sales
-- teaching dispatch (0128) so freshly-refreshed investor knowledge is
-- already available for that run.
select cron.schedule('ai-investor-intelligence-weekly-refresh', '30 1 * * 1', $$select public.ai_run_investor_intelligence_dispatch();$$);
