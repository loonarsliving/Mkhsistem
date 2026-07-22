-- ============================================================================
-- MK Connect — 0161: KontenAI Sprint 3 — AI Director (Creative Brief)
--
-- Real AI Director: user fills a campaign intent form (objective, platform,
-- target audience, product/project, campaign goal), the server reads
-- currently-analyzed Asset Library entries (kontenai_assets.ai_vision_status
-- = 'completed', the Gemini Vision output from Sprint 2) as creative
-- context, and Gemini turns all of that into a Creative Brief. Every brief
-- generated is persisted here so the AI Director page can show history.
--
-- Access is Super Admin only, matching kontenai_assets, via
-- app_is_super_admin().
-- ============================================================================

create table public.kontenai_creative_briefs (
  id uuid primary key default gen_random_uuid(),

  -- User input (the campaign intent form)
  objective text not null check (objective in ('brand_awareness', 'leads', 'sales', 'engagement')),
  platform text not null check (platform in ('instagram', 'tiktok', 'facebook')),
  target_audience text not null,
  product_project text not null,
  campaign_goal text not null,

  -- Gemini output (the Creative Brief)
  big_idea text not null,
  hook text not null,
  key_message text not null,
  target_emotion text not null,
  cta text not null,
  content_angle text not null,

  -- Traceability: which Asset Library entries (with completed Gemini Vision
  -- analysis) were fed to Gemini as creative context for this brief.
  referenced_asset_ids uuid[] not null default '{}',

  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now()
);

comment on table public.kontenai_creative_briefs is 'KontenAI Sprint 3 (AI Director): Creative Briefs generated from a campaign intent form + Asset Library/Gemini Vision context. Read by future sprints (Storyboard Engine) once actually implemented.';
comment on column public.kontenai_creative_briefs.referenced_asset_ids is 'kontenai_assets.id values used as Gemini Vision context for this brief -- traceability only, not a foreign key array (assets may later be deleted/archived without invalidating the brief).';

create index idx_kontenai_creative_briefs_created_at on public.kontenai_creative_briefs (created_at desc);

alter table public.kontenai_creative_briefs enable row level security;

create policy kontenai_creative_briefs_select on public.kontenai_creative_briefs
  for select using (app_is_super_admin());

create policy kontenai_creative_briefs_write on public.kontenai_creative_briefs
  for all using (app_is_super_admin()) with check (app_is_super_admin());
