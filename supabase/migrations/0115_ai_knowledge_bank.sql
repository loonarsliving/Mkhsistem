-- ============================================================================
-- MK Connect — 0115: AI knowledge bank (Meta Ads / Instagram / TikTok /
-- digital marketing), refreshed weekly instead of live-searched per question
--
-- Every markom.ts research function (viral trend research, ad research,
-- weekly content evaluation, ad performance analysis) fires a fresh
-- Gemini + Google Search grounding call every time it runs. Fine for
-- those (each needs current, project-specific research), but wasteful for
-- the WhatsApp AI chat's markom-domain answers, which mostly need general,
-- slower-moving platform knowledge (how Meta Ads/Instagram/TikTok
-- algorithms currently work) that doesn't need re-researching on every
-- single employee question.
--
-- ai_knowledge_bank holds one distilled row per topic, refreshed weekly by
-- a real Gemini + Google Search call (knowledge_bank_refresh job type,
-- lib/ai/domains/knowledge-bank.ts) -- read (cheap, no extra Gemini call)
-- by getSystemPrompt("markom") so every markom-domain answer is grounded
-- in recently-researched platform knowledge without paying for a live
-- search on every question.
-- ============================================================================

create table public.ai_knowledge_bank (
  id uuid primary key default gen_random_uuid(),
  topic text not null unique,
  title text not null,
  content text not null,
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_knowledge_bank is
  'Distilled marketing/platform knowledge (Meta Ads, Instagram, TikTok algorithm & strategy), refreshed weekly via Gemini + Google Search grounding. Read by getSystemPrompt("markom") as static context instead of firing a live web search on every chat question -- saves tokens/latency for the common case, while dedicated research functions (ad drafting, weekly evaluation) keep doing their own live, project-specific search.';

-- Service-role only (matches wa_pending_media_relay, 0113) -- no employee-facing UI reads or writes this table directly.
alter table public.ai_knowledge_bank enable row level security;

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation',
    -- This migration
    'knowledge_bank_refresh'
  ));

create or replace function public.ai_run_knowledge_bank_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text;
  v_topics text[] := array['meta_ads_strategy', 'instagram_strategy', 'tiktok_strategy', 'digital_marketing_general'];
begin
  foreach v_topic in array v_topics loop
    insert into public.ai_job_queue (job_type, payload)
    values ('knowledge_bank_refresh', jsonb_build_object('topic', v_topic));
  end loop;
end;
$$;

comment on function public.ai_run_knowledge_bank_dispatch is
  'Enqueues one knowledge_bank_refresh job per topic (Meta Ads, Instagram, TikTok, general digital marketing) -- each job does its own Gemini + Google Search call and upserts ai_knowledge_bank, isolated so one topic failing does not block the others.';

-- Weekly, Monday 02:00 UTC (10:00 WITA), ahead of the other Monday marketing crons.
select cron.schedule('ai-knowledge-bank-weekly-refresh', '0 2 * * 1', $$select public.ai_run_knowledge_bank_dispatch();$$);
