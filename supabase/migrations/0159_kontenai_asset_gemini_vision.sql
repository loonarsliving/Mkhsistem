-- ============================================================================
-- MK Connect — 0159: KontenAI Sprint 2 -- Gemini Vision analysis columns
--
-- Additive columns on kontenai_assets (Sprint 1) to store the result of
-- sending an uploaded image/video to Gemini Vision (lib/ai/domains --
-- analyzeAssetWithGeminiVision). Kept separate from the user-editable
-- title/description/tags/status columns Sprint 1 already has, since AI
-- results are a distinct, re-runnable ("Analyze Again") layer of metadata,
-- not something that should silently overwrite what a user typed.
-- ============================================================================

alter table public.kontenai_assets
  add column ai_vision_status text not null default 'not_analyzed'
    check (ai_vision_status in ('not_analyzed', 'pending', 'completed', 'failed')),
  add column ai_title text,
  add column ai_description text,
  add column ai_tags text[] not null default '{}',
  add column ai_category text,
  add column ai_detected_objects text[] not null default '{}',
  add column ai_dominant_colors text[] not null default '{}',
  add column ai_mood text,
  add column ai_analyzed_at timestamptz,
  add column ai_error text;

create index idx_kontenai_assets_ai_vision_status on public.kontenai_assets (ai_vision_status) where deleted_at is null;

comment on column public.kontenai_assets.ai_vision_status is 'not_analyzed | pending | completed | failed -- lifecycle of the Gemini Vision analysis for this asset, independently re-runnable via "Analyze Again".';
comment on column public.kontenai_assets.ai_error is 'Last Gemini Vision failure message, cleared on the next successful analysis.';
