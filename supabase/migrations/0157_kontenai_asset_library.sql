-- ============================================================================
-- MK Connect — 0157: KontenAI Sprint 1 — Asset Library
--
-- Foundation table for the KontenAI production pipeline: the single
-- source of truth every future AI Engine (Gemini Vision, AI Director,
-- Storyboard Engine, Asset Selector, Render Engine, Publishing Engine,
-- Learning Engine, AI Optimization) will read assets from. Sprint 1 only
-- builds Asset Management itself -- no AI processing -- so the schema is
-- kept generic/classification-driven (company/project/campaign/platform/
-- content_type/status as free-text dimensions, not FKs into crm_projects,
-- since KontenAI spans brands -- Leasehold, Villa/Occupancy, Beauty, and
-- future ones -- that don't all share the same project model) so later
-- sprints can attach richer AI-derived metadata without a schema change:
-- gemini_metadata / ai_score / usage stats columns can be added additively
-- whenever those sprints are actually implemented.
--
-- Access is Super Admin only for now (matches the app-level gate added in
-- features/kontenai/lib/access.ts) via app_is_super_admin(), the same
-- helper already used elsewhere (e.g. promo_broadcast_super_admin_only).
-- ============================================================================

create table public.kontenai_assets (
  id uuid primary key default gen_random_uuid(),

  -- Core identity
  title text not null,
  description text,
  filename text not null,
  asset_type text not null check (asset_type in ('image', 'video', 'audio', 'logo', 'brand_guideline', 'font', 'template', 'document')),

  -- Storage
  storage_path text not null,
  public_url text not null,
  file_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  resolution text,
  duration_seconds numeric,

  -- Classification / virtual folder structure (Sprint 1 scope #2 and #3)
  company text,
  project text,
  campaign text,
  platform text,
  content_type text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  tags text[] not null default '{}',

  -- Keyword search (title + description + filename) -- kept as a
  -- generated column so search stays index-backed as the library grows,
  -- instead of an ILIKE scan across every row. Tag search is handled
  -- separately via idx_kontenai_assets_tags (array_to_string() is STABLE,
  -- not IMMUTABLE, so tags can't be folded into this generated column).
  search_text tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(filename, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(description, '')), 'C')
  ) stored,

  -- Attribution
  created_by uuid not null references public.employees(id),
  updated_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.kontenai_assets is 'KontenAI Sprint 1 (Asset Library): single source of truth for every marketing asset. Future sprints (Gemini Vision, AI Director, Storyboard Engine, Asset Selector, Render Engine, Publishing, Learning Engine, AI Optimization) read/write this table instead of duplicating asset storage.';
comment on column public.kontenai_assets.status is 'draft | active | archived -- lifecycle/virtual-folder status, not a soft-delete flag (see deleted_at for that).';
comment on column public.kontenai_assets.company is 'Free-text classification (e.g. Leasehold, Villa/Occupancy, Loonars Beauty) -- not an FK, since KontenAI spans brands that do not all share crm_projects.';

create index idx_kontenai_assets_asset_type on public.kontenai_assets (asset_type) where deleted_at is null;
create index idx_kontenai_assets_status on public.kontenai_assets (status) where deleted_at is null;
create index idx_kontenai_assets_company on public.kontenai_assets (company) where deleted_at is null;
create index idx_kontenai_assets_project on public.kontenai_assets (project) where deleted_at is null;
create index idx_kontenai_assets_campaign on public.kontenai_assets (campaign) where deleted_at is null;
create index idx_kontenai_assets_platform on public.kontenai_assets (platform) where deleted_at is null;
create index idx_kontenai_assets_content_type on public.kontenai_assets (content_type) where deleted_at is null;
create index idx_kontenai_assets_created_at on public.kontenai_assets (created_at desc) where deleted_at is null;
create index idx_kontenai_assets_tags on public.kontenai_assets using gin (tags);
create index idx_kontenai_assets_search on public.kontenai_assets using gin (search_text);

create trigger set_updated_at
  before update on public.kontenai_assets
  for each row execute function public.set_updated_at();

alter table public.kontenai_assets enable row level security;

create policy kontenai_assets_select on public.kontenai_assets
  for select using (app_is_super_admin());

create policy kontenai_assets_write on public.kontenai_assets
  for all using (app_is_super_admin()) with check (app_is_super_admin());

-- ----------------------------------------------------------------------------
-- Storage bucket
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kontenai-assets', 'kontenai-assets', true, 209715200, null)
on conflict (id) do nothing;

create policy kontenai_assets_bucket_select on storage.objects
  for select using (bucket_id = 'kontenai-assets');

create policy kontenai_assets_bucket_insert on storage.objects
  for insert with check (bucket_id = 'kontenai-assets' and app_is_super_admin());

create policy kontenai_assets_bucket_update on storage.objects
  for update using (bucket_id = 'kontenai-assets' and app_is_super_admin())
  with check (bucket_id = 'kontenai-assets' and app_is_super_admin());

create policy kontenai_assets_bucket_delete on storage.objects
  for delete using (bucket_id = 'kontenai-assets' and app_is_super_admin());
