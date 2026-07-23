-- ============================================================================
-- MK Connect — 0085: Content Planner (Social Media Specialist) foundation
--
-- Reuses the existing kpi_tasks + markom_checklist_draft pipeline (0070)
-- for the daily content checklist itself -- that already handles per-branch
-- distribution, notifications, and the Markom dashboard UI, so it's the
-- checklist's description that gets richer (hook/format/duration/caption/
-- CTA/hashtag/upload time), not a new parallel checklist system.
--
-- What's genuinely new here: competitor tracking (no API exists for pulling
-- a competitor's real engagement data on either platform -- Markom logs
-- what they observe by hand, AI analyzes the logs), own-account performance
-- snapshots (Instagram Graph API; TikTok once credentials exist), and
-- weekly AI evaluations. Company-wide, not branch-scoped -- there's one
-- shared company Instagram/TikTok presence, not one per branch.
-- ============================================================================

insert into public.permissions (key, description) values
  ('content_planner.view', 'View Content Planner: own-account performance, competitor logs, weekly evaluations'),
  ('content_planner.manage', 'Manage Content Planner: register competitors, log competitor content, trigger research')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'markom' and p.key in ('content_planner.view', 'content_planner.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key in ('direktur_utama', 'direktur_operasional') and p.key in ('content_planner.view', 'content_planner.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- social_competitor_accounts: competitors Markom has registered for AI to
-- research (public content only, no engagement API exists for either
-- platform on accounts you don't own).
-- ----------------------------------------------------------------------------
create table public.social_competitor_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'tiktok')),
  handle text not null,
  display_name text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index social_competitor_accounts_platform_handle_key on public.social_competitor_accounts (platform, lower(handle));

-- ----------------------------------------------------------------------------
-- social_competitor_content_logs: what Markom actually observed on a
-- competitor's post -- the only accurate source of competitor performance
-- data, since neither platform's API exposes it for accounts you don't own.
-- ----------------------------------------------------------------------------
create table public.social_competitor_content_logs (
  id uuid primary key default gen_random_uuid(),
  competitor_account_id uuid not null references public.social_competitor_accounts(id) on delete cascade,
  content_url text,
  content_type text check (content_type in ('reel', 'video', 'photo', 'carousel', 'story', 'other')),
  hook text,
  duration_seconds smallint,
  caption text,
  hashtags text,
  engagement_notes text,
  logged_by uuid not null references public.employees(id) on delete restrict,
  logged_at timestamptz not null default now()
);
create index social_competitor_content_logs_account_id_idx on public.social_competitor_content_logs (competitor_account_id);

-- ----------------------------------------------------------------------------
-- social_account_snapshots: own-account performance, pulled from each
-- platform's real API for the company's own connected account. One row per
-- capture (daily cron once Instagram/TikTok are configured).
-- ----------------------------------------------------------------------------
create table public.social_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'tiktok')),
  captured_at timestamptz not null default now(),
  followers_count integer,
  reach integer,
  impressions integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  watch_time_seconds integer,
  engagement_rate numeric(6, 3),
  best_upload_hour smallint,
  top_content_type text,
  raw_data jsonb
);
create index social_account_snapshots_platform_captured_idx on public.social_account_snapshots (platform, captured_at desc);

-- ----------------------------------------------------------------------------
-- social_weekly_evaluations: AI's written weekly evaluation (what worked,
-- what didn't, competitor strategy shifts, trend changes, next-week
-- recommendation) -- one row per week.
-- ----------------------------------------------------------------------------
create table public.social_weekly_evaluations (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  evaluation text not null,
  created_at timestamptz not null default now()
);
create unique index social_weekly_evaluations_week_start_key on public.social_weekly_evaluations (week_start);

alter table public.social_competitor_accounts enable row level security;
alter table public.social_competitor_content_logs enable row level security;
alter table public.social_account_snapshots enable row level security;
alter table public.social_weekly_evaluations enable row level security;

create policy social_competitor_accounts_select on public.social_competitor_accounts for select to authenticated
  using (public.app_has_permission('content_planner.view'));
create policy social_competitor_accounts_write on public.social_competitor_accounts for all to authenticated
  using (public.app_has_permission('content_planner.manage'))
  with check (public.app_has_permission('content_planner.manage'));

create policy social_competitor_content_logs_select on public.social_competitor_content_logs for select to authenticated
  using (public.app_has_permission('content_planner.view'));
create policy social_competitor_content_logs_write on public.social_competitor_content_logs for all to authenticated
  using (public.app_has_permission('content_planner.manage'))
  with check (public.app_has_permission('content_planner.manage'));

create policy social_account_snapshots_select on public.social_account_snapshots for select to authenticated
  using (public.app_has_permission('content_planner.view'));

create policy social_weekly_evaluations_select on public.social_weekly_evaluations for select to authenticated
  using (public.app_has_permission('content_planner.view'));
