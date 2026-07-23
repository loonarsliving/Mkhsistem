-- ============================================================================
-- MK Connect — 0164: KontenAI Sprint 7 — Publishing Engine
--
-- Schedules a Render Engine draft (Sprint 6) for publishing: caption +
-- hashtags (generated from the storyboard's Creative Brief via AI
-- Director), destination platform, and a scheduled date/time. Actual
-- platform posting is out of scope this sprint (see
-- lib/publishing/platform-adapters.ts) -- this table + status lifecycle is
-- the structure a later sprint's real API integration will drive.
--
-- Access is Super Admin only, matching the rest of KontenAI, via
-- app_is_super_admin().
-- ============================================================================

create table public.kontenai_publish_schedules (
  id uuid primary key default gen_random_uuid(),

  render_job_id uuid not null references public.kontenai_render_jobs(id),
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'youtube_shorts')),
  caption text not null default '',
  hashtags text[] not null default '{}',

  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  published_at timestamptz,
  external_post_id text,
  external_post_url text,
  error_message text,

  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kontenai_publish_schedules is 'KontenAI Sprint 7 (Publishing Engine): schedules a Render Engine draft for publishing to a platform. status: draft -> scheduled -> published|failed. Real platform posting is a future sprint (see lib/publishing/platform-adapters.ts).';

create index idx_kontenai_publish_schedules_render_job_id on public.kontenai_publish_schedules (render_job_id);
create index idx_kontenai_publish_schedules_scheduled_at on public.kontenai_publish_schedules (scheduled_at);
create index idx_kontenai_publish_schedules_status on public.kontenai_publish_schedules (status);

create trigger set_updated_at
  before update on public.kontenai_publish_schedules
  for each row execute function public.set_updated_at();

alter table public.kontenai_publish_schedules enable row level security;

create policy kontenai_publish_schedules_select on public.kontenai_publish_schedules
  for select using (app_is_super_admin());

create policy kontenai_publish_schedules_write on public.kontenai_publish_schedules
  for all using (app_is_super_admin()) with check (app_is_super_admin());
