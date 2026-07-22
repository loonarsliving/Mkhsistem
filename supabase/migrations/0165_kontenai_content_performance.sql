-- ============================================================================
-- MK Connect — 0165: KontenAI Sprint 8 — Learning Engine
--
-- Logs real performance metrics for a published/posted piece of content
-- (Sprint 7's kontenai_publish_schedules), then an AI-generated insight
-- explaining why it did/didn't perform well plus concrete recommendations
-- for the next piece of content (hook, duration, CTA, visual, target
-- emotion). Metrics are entered manually -- no analytics API is wired up
-- yet (Publishing Engine's platform adapters are still stubs, so there is
-- no automatic source of real view/like/reach numbers), matching the
-- Sprint 7 precedent of a genuinely-not-yet-automated integration point.
--
-- Access is Super Admin only, matching the rest of KontenAI, via
-- app_is_super_admin().
-- ============================================================================

create table public.kontenai_content_performance (
  id uuid primary key default gen_random_uuid(),

  publish_schedule_id uuid not null references public.kontenai_publish_schedules(id),

  views numeric not null default 0,
  reach numeric not null default 0,
  likes numeric not null default 0,
  comments numeric not null default 0,
  shares numeric not null default 0,
  saves numeric not null default 0,
  ctr numeric,
  leads numeric,

  ai_insight text not null default '',
  recommended_hook text not null default '',
  recommended_duration_seconds numeric,
  recommended_cta text not null default '',
  recommended_visual text not null default '',
  recommended_target_emotion text not null default '',

  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kontenai_content_performance is 'KontenAI Sprint 8 (Learning Engine): performance metrics + AI insight/recommendations for one published piece of content. Metrics are entered manually -- no analytics API is wired up yet.';

create index idx_kontenai_content_performance_publish_schedule_id on public.kontenai_content_performance (publish_schedule_id);
create index idx_kontenai_content_performance_created_at on public.kontenai_content_performance (created_at desc);

create trigger set_updated_at
  before update on public.kontenai_content_performance
  for each row execute function public.set_updated_at();

alter table public.kontenai_content_performance enable row level security;

create policy kontenai_content_performance_select on public.kontenai_content_performance
  for select using (app_is_super_admin());

create policy kontenai_content_performance_write on public.kontenai_content_performance
  for all using (app_is_super_admin()) with check (app_is_super_admin());
