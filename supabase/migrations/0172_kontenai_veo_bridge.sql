-- Beauty-to-KontenAI bridge: (1) tags a creative brief with which brand it's
-- for (leasehold/villa/beauty), (2) links a Loonars Beauty content item to
-- the creative brief it was sent to (so the UI can show "sudah dikirim" and
-- the bridge action doesn't double-submit), (3) queues Veo image-to-video
-- generation for storyboard scenes Asset Selector couldn't find a good
-- Asset Library match for -- filled in by scripts/veo-worker.ts, which runs
-- continuously outside Vercel (same reasoning as the render worker: video
-- generation takes minutes, far past a serverless function's budget).
alter table public.kontenai_creative_briefs
  add column content_focus text;

alter table public.kontenai_creative_briefs
  add constraint kontenai_creative_briefs_content_focus_check
    check (content_focus is null or content_focus in ('leasehold_sales', 'occupancy', 'beauty'));

comment on column public.kontenai_creative_briefs.content_focus is 'Which brand this brief is for -- leasehold_sales/occupancy/beauty, same vocabulary as markom_content_submissions. Null for briefs made before this column existed.';

alter table public.loonars_content_items
  add column kontenai_creative_brief_id uuid references public.kontenai_creative_briefs(id) on delete set null;

comment on column public.loonars_content_items.kontenai_creative_brief_id is 'Set once this content item has been sent into the KontenAI production pipeline (AI Director -> Storyboard -> Asset Selector -> Render Engine) instead of being shot manually.';

create table public.kontenai_video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null references public.kontenai_storyboards(id) on delete cascade,
  scene_id text not null,
  prompt text not null,
  base_asset_id uuid references public.kontenai_assets(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'generating', 'completed', 'failed')),
  generated_asset_id uuid references public.kontenai_assets(id) on delete set null,
  error_message text,
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index kontenai_video_generation_jobs_status_idx on public.kontenai_video_generation_jobs (status, created_at);
create index kontenai_video_generation_jobs_storyboard_idx on public.kontenai_video_generation_jobs (storyboard_id);

alter table public.kontenai_video_generation_jobs enable row level security;

create policy kontenai_video_generation_jobs_select on public.kontenai_video_generation_jobs
  for select using (app_is_super_admin());

create policy kontenai_video_generation_jobs_write on public.kontenai_video_generation_jobs
  for all using (app_is_super_admin()) with check (app_is_super_admin());
