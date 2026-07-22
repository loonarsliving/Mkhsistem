-- ============================================================================
-- MK Connect — 0162: KontenAI Sprint 4 — Storyboard Engine
--
-- Real Storyboard Engine: turns a Creative Brief (Sprint 3 - AI Director,
-- kontenai_creative_briefs) into a concrete scene-by-scene storyboard.
-- Scenes are stored as a jsonb array (like kontenai_assets.ai_scene_summary)
-- rather than a child table -- the whole array is replaced together on every
-- edit (add/remove/reorder scene), which is simpler and matches how the
-- builder UI edits them as one ordered list.
--
-- Access is Super Admin only, matching kontenai_assets/kontenai_creative_briefs,
-- via app_is_super_admin().
-- ============================================================================

create table public.kontenai_storyboards (
  id uuid primary key default gen_random_uuid(),

  creative_brief_id uuid not null references public.kontenai_creative_briefs(id),
  title text not null,

  -- Array of {id, order, sceneTitle, visualDescription, cameraAngle,
  -- shotType, motion, voiceOver, onScreenText, durationSeconds}, in
  -- storyboard order.
  scenes jsonb not null default '[]'::jsonb,
  total_duration_seconds numeric not null default 0,

  created_by uuid not null references public.employees(id),
  updated_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kontenai_storyboards is 'KontenAI Sprint 4 (Storyboard Engine): scene-by-scene storyboards generated from a Creative Brief. Read by future sprints (Asset Selector, Render Engine) once actually implemented.';
comment on column public.kontenai_storyboards.scenes is 'Ordered array of scene objects -- see repositories/kontenai-storyboards.repository.ts KontenAiStoryboardScene for the exact shape.';

create index idx_kontenai_storyboards_creative_brief_id on public.kontenai_storyboards (creative_brief_id);
create index idx_kontenai_storyboards_created_at on public.kontenai_storyboards (created_at desc);

create trigger set_updated_at
  before update on public.kontenai_storyboards
  for each row execute function public.set_updated_at();

alter table public.kontenai_storyboards enable row level security;

create policy kontenai_storyboards_select on public.kontenai_storyboards
  for select using (app_is_super_admin());

create policy kontenai_storyboards_write on public.kontenai_storyboards
  for all using (app_is_super_admin()) with check (app_is_super_admin());
