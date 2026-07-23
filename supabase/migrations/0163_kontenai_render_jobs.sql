-- ============================================================================
-- MK Connect — 0163: KontenAI Sprint 6 — Render Engine
--
-- Real Render Engine: turns a render-ready storyboard (every scene has a
-- selected asset, from Asset Selector Sprint 5) into one draft mp4 via
-- FFmpeg -- assets assembled in scene order, each trimmed/looped to its
-- scene duration, simple fade in/out per scene, a silent placeholder audio
-- track (real Voice Over/BGM is out of scope for this sprint), output
-- uploaded to Supabase Storage. Progress is reported via `progress`/`stage`,
-- updated at each pipeline step so the UI can poll real, not simulated,
-- status.
--
-- Access is Super Admin only, matching the rest of KontenAI, via
-- app_is_super_admin().
-- ============================================================================

create table public.kontenai_render_jobs (
  id uuid primary key default gen_random_uuid(),

  storyboard_id uuid not null references public.kontenai_storyboards(id),
  status text not null default 'queued' check (status in ('queued', 'rendering', 'completed', 'failed')),
  progress numeric not null default 0 check (progress >= 0 and progress <= 100),
  stage text not null default 'Menunggu di antrian',

  output_storage_path text,
  output_public_url text,
  duration_seconds numeric,
  error_message text,

  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

comment on table public.kontenai_render_jobs is 'KontenAI Sprint 6 (Render Engine): FFmpeg draft-video render jobs, one per storyboard render attempt. progress/stage are updated synchronously during the render so the UI can poll real status.';

create index idx_kontenai_render_jobs_storyboard_id on public.kontenai_render_jobs (storyboard_id);
create index idx_kontenai_render_jobs_created_at on public.kontenai_render_jobs (created_at desc);

alter table public.kontenai_render_jobs enable row level security;

create policy kontenai_render_jobs_select on public.kontenai_render_jobs
  for select using (app_is_super_admin());

create policy kontenai_render_jobs_write on public.kontenai_render_jobs
  for all using (app_is_super_admin()) with check (app_is_super_admin());

-- ----------------------------------------------------------------------------
-- Storage bucket for render outputs
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kontenai-renders', 'kontenai-renders', true, 314572800, array['video/mp4'])
on conflict (id) do nothing;

create policy kontenai_renders_bucket_select on storage.objects
  for select using (bucket_id = 'kontenai-renders');

create policy kontenai_renders_bucket_insert on storage.objects
  for insert with check (bucket_id = 'kontenai-renders' and app_is_super_admin());

create policy kontenai_renders_bucket_update on storage.objects
  for update using (bucket_id = 'kontenai-renders' and app_is_super_admin())
  with check (bucket_id = 'kontenai-renders' and app_is_super_admin());

create policy kontenai_renders_bucket_delete on storage.objects
  for delete using (bucket_id = 'kontenai-renders' and app_is_super_admin());
