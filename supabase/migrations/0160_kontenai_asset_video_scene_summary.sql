-- ============================================================================
-- MK Connect — 0160: KontenAI Sprint 2 (Video Intelligence) -- scene summary
--
-- Adds ai_scene_summary (jsonb array of {timestampSeconds, description})
-- to kontenai_assets, populated when video keyframe analysis
-- (lib/video/extract-keyframes.ts + lib/ai/domains/kontenai-vision.ts's
-- analyzeVideoKeyframe/combineVideoSceneAnalysis) succeeds. Null/empty for
-- images and for videos whose frame extraction failed outright (see
-- analyzeVideoWithoutFrames fallback).
-- ============================================================================

alter table public.kontenai_assets
  add column ai_scene_summary jsonb not null default '[]'::jsonb;

comment on column public.kontenai_assets.ai_scene_summary is 'Array of {timestampSeconds: number, description: string} -- one entry per Gemini-analyzed video keyframe, in chronological order. Empty for images.';
