-- ============================================================================
-- MK Connect — 0084: AI performance analysis per ad campaign
--
-- Adds cached Meta insight numbers (spend/impressions/clicks/WhatsApp
-- conversations started) and an AI-written analysis to meta_ad_campaigns.
-- The raw numbers are a plain Meta Graph API read (no Gemini call) --
-- only the narrative analysis + recommendation genuinely needs generation,
-- per the "AI only for real analysis/generation" rule established
-- throughout this project's automation work.
-- ============================================================================

alter table public.meta_ad_campaigns
  add column spend_idr integer,
  add column impressions integer,
  add column clicks integer,
  add column conversations_started integer,
  add column ai_analysis text,
  add column analyzed_at timestamptz;

comment on column public.meta_ad_campaigns.ai_analysis is 'AI-written performance analysis + recommendation (Bahasa Indonesia), generated on demand from the cached insight numbers via analyzeAdPerformance() (lib/ai/domains/markom.ts).';
