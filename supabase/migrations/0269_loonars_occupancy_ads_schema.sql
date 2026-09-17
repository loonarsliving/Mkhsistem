-- ============================================================================
-- MK Connect — 0269: Loonars AI Occupancy Ads — core schema
--
-- NOT YET APPLIED TO THE LIVE DATABASE — see 0268's header and
-- docs/project-memory/FEATURES.md for the approval gate. Committed for
-- review only.
--
-- `loonars_` prefix (not `mkc_`) per the task's own naming guidance, to
-- keep this module's tables unambiguous in the shared Supabase project
-- (svcmybsziaelwwdrnzcv, also used by the separate villa-rental app) even
-- though none of these names collide with anything found in this repo's
-- own migration history today.
--
-- Occupancy data itself (the calendar, the villa-api snapshot) is NEVER
-- stored here -- lib/occupancy/villa-provider.ts reads it live from
-- villa-api on every request, per the module's read-only/no-fabrication
-- design. Only AI-generated campaign artifacts and admin config live in
-- these tables.
--
-- Standard shape throughout: UUID PK, created_at/updated_at/created_by/
-- updated_by, soft delete via deleted_at where the row can be "un-listed"
-- without breaking history, RLS enabled with app_has_permission()-gated
-- policies mirroring meta_ad_campaigns' policy shape (0079).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- loonars_occupancy_targets — admin-configured target/critical occupancy %,
-- max daily budget, per property. One row per property (property is a plain
-- text label -- villa's own property/unit catalog lives in the separate
-- villa repo, not mirrored here).
-- ----------------------------------------------------------------------------
create table public.loonars_occupancy_targets (
  id uuid primary key default gen_random_uuid(),
  property_name text not null,
  target_occupancy_pct numeric(5,2) not null check (target_occupancy_pct > 0 and target_occupancy_pct <= 100),
  critical_occupancy_pct numeric(5,2) not null check (critical_occupancy_pct > 0 and critical_occupancy_pct <= 100),
  max_daily_budget_idr integer not null check (max_daily_budget_idr >= 0),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null,
  constraint loonars_occupancy_targets_thresholds_ordered check (critical_occupancy_pct >= target_occupancy_pct)
);

create unique index loonars_occupancy_targets_property_active_idx
  on public.loonars_occupancy_targets (property_name) where deleted_at is null and is_active;

create trigger set_updated_at before update on public.loonars_occupancy_targets
  for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.loonars_occupancy_targets
  for each row execute function public.audit_log_trigger();

alter table public.loonars_occupancy_targets enable row level security;
create policy loonars_occupancy_targets_select on public.loonars_occupancy_targets for select to authenticated
  using (public.app_has_permission('occupancy_ads.view') or public.app_has_permission('occupancy_ads.manage'));
create policy loonars_occupancy_targets_write on public.loonars_occupancy_targets for all to authenticated
  using (public.app_has_permission('occupancy_ads.manage'))
  with check (public.app_has_permission('occupancy_ads.manage'));

-- ----------------------------------------------------------------------------
-- loonars_creative_assets — media library (Bagian K-style: filename,
-- property, tags, dimensions, size, status). Mirrors features/kontenai's
-- asset-library data shape at a much smaller scope.
-- ----------------------------------------------------------------------------
create table public.loonars_creative_assets (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  property_name text,
  tags text[] not null default '{}',
  media_type text not null check (media_type in ('image', 'video')),
  width_px integer,
  height_px integer,
  size_bytes bigint,
  storage_path text not null,
  public_url text not null,
  status text not null default 'draft' check (status in ('draft', 'ai_generated', 'review', 'approved', 'ready', 'active', 'archived')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null
);

create index loonars_creative_assets_status_idx on public.loonars_creative_assets (status) where deleted_at is null;
create index loonars_creative_assets_tags_idx on public.loonars_creative_assets using gin (tags);

create trigger set_updated_at before update on public.loonars_creative_assets
  for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.loonars_creative_assets
  for each row execute function public.audit_log_trigger();

alter table public.loonars_creative_assets enable row level security;
create policy loonars_creative_assets_select on public.loonars_creative_assets for select to authenticated
  using (public.app_has_permission('occupancy_ads.view') or public.app_has_permission('occupancy_ads.manage'));
create policy loonars_creative_assets_write on public.loonars_creative_assets for all to authenticated
  using (public.app_has_permission('occupancy_ads.manage'))
  with check (public.app_has_permission('occupancy_ads.manage'));

-- ----------------------------------------------------------------------------
-- loonars_occupancy_campaigns — extends/parallels meta_ad_campaigns' shape
-- (0079) but scoped to this module. Full draft -> ... -> archived lifecycle;
-- meta_campaign_id/adset_id/ad_id stay null until actually launched.
-- ----------------------------------------------------------------------------
create table public.loonars_occupancy_campaigns (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references public.loonars_occupancy_targets(id) on delete set null,
  property_name text not null,
  name text not null,
  objective text not null check (objective in ('last_minute_gap_fill', 'weekend_boost', 'seasonal_push', 'long_stay_offer')),
  target_dates date[] not null,
  target_market text not null,
  audience_persona text not null,
  creative_angle text,
  offer text,
  daily_budget_idr integer not null check (daily_budget_idr >= 0),
  duration_days integer not null check (duration_days > 0),
  headline text,
  primary_text text,
  description text,
  cta text,
  destination_url text not null default 'https://loonars.id',
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'ready_for_meta', 'active', 'paused', 'completed', 'archived', 'failed')),
  launched_by text check (launched_by in ('ai', 'human')),
  meta_campaign_id text,
  meta_adset_id text,
  meta_creative_id text,
  meta_ad_id text,
  failure_reason text,
  spend_idr integer,
  impressions integer,
  clicks integer,
  launched_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null,
  constraint loonars_occupancy_campaigns_destination_url_check check (destination_url like 'https://loonars.id%')
);

create index loonars_occupancy_campaigns_status_idx on public.loonars_occupancy_campaigns (status) where deleted_at is null;
create index loonars_occupancy_campaigns_target_idx on public.loonars_occupancy_campaigns (target_id);

create trigger set_updated_at before update on public.loonars_occupancy_campaigns
  for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.loonars_occupancy_campaigns
  for each row execute function public.audit_log_trigger();

alter table public.loonars_occupancy_campaigns enable row level security;
create policy loonars_occupancy_campaigns_select on public.loonars_occupancy_campaigns for select to authenticated
  using (public.app_has_permission('occupancy_ads.view') or public.app_has_permission('occupancy_ads.manage'));
create policy loonars_occupancy_campaigns_write on public.loonars_occupancy_campaigns for all to authenticated
  using (public.app_has_permission('occupancy_ads.manage'))
  with check (public.app_has_permission('occupancy_ads.manage'));

-- ----------------------------------------------------------------------------
-- loonars_campaign_briefs — the structured AI output durably stored (spec
-- §39's JSON schema), one row per AI research run for a campaign. Kept
-- separate from loonars_occupancy_campaigns (which holds the editable/
-- current working copy) so a re-run's raw AI output is never lost, and so
-- a human's post-review edits to the campaign row don't rewrite history.
-- ----------------------------------------------------------------------------
create table public.loonars_campaign_briefs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.loonars_occupancy_campaigns(id) on delete cascade,
  raw_ai_response jsonb not null,
  campaign_objective text not null,
  target_dates date[] not null,
  target_market text not null,
  audience_persona text not null,
  creative_angle text,
  offer text,
  recommended_budget_idr_raw integer,
  duration_days integer,
  primary_text text,
  headline text,
  description text,
  cta text,
  destination_url text,
  selected_asset_ids uuid[] not null default '{}',
  reasoning text,
  confidence text check (confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null
);

create index loonars_campaign_briefs_campaign_idx on public.loonars_campaign_briefs (campaign_id, created_at desc);

alter table public.loonars_campaign_briefs enable row level security;
create policy loonars_campaign_briefs_select on public.loonars_campaign_briefs for select to authenticated
  using (public.app_has_permission('occupancy_ads.view') or public.app_has_permission('occupancy_ads.manage'));
create policy loonars_campaign_briefs_write on public.loonars_campaign_briefs for all to authenticated
  using (public.app_has_permission('occupancy_ads.manage'))
  with check (public.app_has_permission('occupancy_ads.manage'));

-- ----------------------------------------------------------------------------
-- loonars_campaign_recommendations — AI's scale/maintain/reduce/pause
-- decisions with reasoning, timestamped. Purely advisory rows -- applying a
-- recommendation is still a separate human-confirmed action against the
-- campaign row, same two-step discipline as the launch flow.
-- ----------------------------------------------------------------------------
create table public.loonars_campaign_recommendations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.loonars_occupancy_campaigns(id) on delete cascade,
  recommendation text not null check (recommendation in ('scale', 'maintain', 'reduce', 'pause')),
  reasoning text not null,
  metrics_snapshot jsonb,
  applied boolean not null default false,
  applied_at timestamptz,
  applied_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index loonars_campaign_recommendations_campaign_idx on public.loonars_campaign_recommendations (campaign_id, created_at desc);

alter table public.loonars_campaign_recommendations enable row level security;
create policy loonars_campaign_recommendations_select on public.loonars_campaign_recommendations for select to authenticated
  using (public.app_has_permission('occupancy_ads.view') or public.app_has_permission('occupancy_ads.manage'));
create policy loonars_campaign_recommendations_write on public.loonars_campaign_recommendations for all to authenticated
  using (public.app_has_permission('occupancy_ads.manage'))
  with check (public.app_has_permission('occupancy_ads.manage'));

-- ----------------------------------------------------------------------------
-- loonars_campaign_learnings — historical outcomes for future learning.
-- One row per COMPLETED campaign. A minimum-sample-size read rule
-- (MIN_LEARNING_SAMPLE_SIZE, lib/occupancy/campaign-rules.ts) is enforced in
-- application code when this table is queried for AI context, not here --
-- this table just stores every outcome, aggregation with the sample-size
-- gate happens at read time.
-- ----------------------------------------------------------------------------
create table public.loonars_campaign_learnings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.loonars_occupancy_campaigns(id) on delete set null,
  market text not null,
  persona text not null,
  creative_angle text,
  offer text,
  budget_idr integer,
  spend_idr integer,
  cac_idr numeric(12,2),
  ctr_pct numeric(5,2),
  conversions integer,
  outcome_notes text,
  created_at timestamptz not null default now()
);

create index loonars_campaign_learnings_market_persona_idx on public.loonars_campaign_learnings (market, persona);

alter table public.loonars_campaign_learnings enable row level security;
create policy loonars_campaign_learnings_select on public.loonars_campaign_learnings for select to authenticated
  using (public.app_has_permission('occupancy_ads.view') or public.app_has_permission('occupancy_ads.manage'));
create policy loonars_campaign_learnings_write on public.loonars_campaign_learnings for all to authenticated
  using (public.app_has_permission('occupancy_ads.manage'))
  with check (public.app_has_permission('occupancy_ads.manage'));

-- ----------------------------------------------------------------------------
-- loonars_creative_variants — parent asset, campaign, crop/format,
-- generated copy fields, approval state.
-- ----------------------------------------------------------------------------
create table public.loonars_creative_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.loonars_creative_assets(id) on delete cascade,
  campaign_id uuid references public.loonars_occupancy_campaigns(id) on delete set null,
  format text not null check (format in ('square_1x1', 'portrait_4x5', 'story_9x16', 'landscape_16x9')),
  storage_path text,
  public_url text,
  generated_headline text,
  generated_primary_text text,
  approval_state text not null default 'pending' check (approval_state in ('pending', 'approved', 'rejected')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null
);

create index loonars_creative_variants_asset_idx on public.loonars_creative_variants (asset_id) where deleted_at is null;
create index loonars_creative_variants_campaign_idx on public.loonars_creative_variants (campaign_id) where deleted_at is null;

create trigger set_updated_at before update on public.loonars_creative_variants
  for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.loonars_creative_variants
  for each row execute function public.audit_log_trigger();

alter table public.loonars_creative_variants enable row level security;
create policy loonars_creative_variants_select on public.loonars_creative_variants for select to authenticated
  using (public.app_has_permission('occupancy_ads.view') or public.app_has_permission('occupancy_ads.manage'));
create policy loonars_creative_variants_write on public.loonars_creative_variants for all to authenticated
  using (public.app_has_permission('occupancy_ads.manage'))
  with check (public.app_has_permission('occupancy_ads.manage'));

-- ----------------------------------------------------------------------------
-- Storage bucket: occupancy-ads-assets. Public read (Meta previews these
-- URLs the same way markom-content-submissions' photos are read, see
-- 0096), write gated by occupancy_ads.manage. Image + video/mp4 +
-- video/quicktime, mirroring markom-content-submissions' allow-list and
-- size cap.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('occupancy-ads-assets', 'occupancy-ads-assets', true, 52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create policy occupancy_ads_assets_bucket_select on storage.objects for select to authenticated, anon
  using (bucket_id = 'occupancy-ads-assets');
create policy occupancy_ads_assets_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'occupancy-ads-assets' and public.app_has_permission('occupancy_ads.manage'));
create policy occupancy_ads_assets_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'occupancy-ads-assets' and public.app_has_permission('occupancy_ads.manage'));
create policy occupancy_ads_assets_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'occupancy-ads-assets' and public.app_has_permission('occupancy_ads.manage'));
