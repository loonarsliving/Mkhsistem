-- ============================================================================
-- MK Connect — 0166: KontenAI Sprint 9 — Analytics & Optimization
--
-- Analytics Dashboard (KPIs, performance-over-time chart, top/worst
-- content) is computed live over already-Supabase-backed tables
-- (kontenai_publish_schedules, kontenai_content_performance) -- no
-- separate snapshot table needed for that read-only view. What DOES get
-- persisted here is the AI-generated output history:
--
-- kontenai_optimization_recommendations: one row per "AI Recommendation"
-- generation, reasoning over Learning Engine's accumulated performance +
-- insights (Sprint 8) into concrete Hook/Caption/CTA/Duration/Visual
-- Style/Posting Time recommendations.
--
-- kontenai_ai_reports: one row per weekly/monthly AI Report generation --
-- a snapshot of the period's KPIs plus an AI narrative summary.
--
-- Access is Super Admin only, matching the rest of KontenAI, via
-- app_is_super_admin().
-- ============================================================================

create table public.kontenai_optimization_recommendations (
  id uuid primary key default gen_random_uuid(),

  recommended_hook text not null,
  recommended_caption text not null,
  recommended_cta text not null,
  recommended_duration_seconds numeric,
  recommended_visual_style text not null,
  recommended_posting_time text not null,
  rationale text not null,
  based_on_record_count int not null default 0,

  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now()
);

comment on table public.kontenai_optimization_recommendations is 'KontenAI Sprint 9 (Analytics & Optimization): AI-generated next-content recommendations reasoning over Learning Engine''s accumulated performance history.';

create index idx_kontenai_optimization_recommendations_created_at on public.kontenai_optimization_recommendations (created_at desc);

alter table public.kontenai_optimization_recommendations enable row level security;

create policy kontenai_optimization_recommendations_select on public.kontenai_optimization_recommendations
  for select using (app_is_super_admin());

create policy kontenai_optimization_recommendations_write on public.kontenai_optimization_recommendations
  for all using (app_is_super_admin()) with check (app_is_super_admin());

create table public.kontenai_ai_reports (
  id uuid primary key default gen_random_uuid(),

  period text not null check (period in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,

  total_content int not null default 0,
  published_content int not null default 0,
  total_views numeric not null default 0,
  total_reach numeric not null default 0,
  engagement_rate numeric not null default 0,
  avg_ctr numeric,
  total_leads numeric,
  conversion_rate numeric,

  summary text not null,

  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now()
);

comment on table public.kontenai_ai_reports is 'KontenAI Sprint 9 (Analytics & Optimization): the "AI Report" page -- one row per weekly/monthly report generation, a KPI snapshot plus an AI narrative summary of that period.';

create index idx_kontenai_ai_reports_created_at on public.kontenai_ai_reports (created_at desc);

alter table public.kontenai_ai_reports enable row level security;

create policy kontenai_ai_reports_select on public.kontenai_ai_reports
  for select using (app_is_super_admin());

create policy kontenai_ai_reports_write on public.kontenai_ai_reports
  for all using (app_is_super_admin()) with check (app_is_super_admin());
