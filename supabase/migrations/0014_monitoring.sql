-- ============================================================================
-- MK Connect — Monitoring: error tracking, performance metrics, health check
-- ============================================================================

create table public.mkc_error_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  level text not null check (level in ('warning', 'error', 'fatal')),
  source text not null check (source in ('client', 'server')),
  message text not null,
  stack text,
  digest text,
  context jsonb not null default '{}'::jsonb,
  url text,
  user_agent text,
  user_id uuid references public.employees (id) on delete set null,
  environment text not null default 'production',
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now()
);

create index mkc_error_logs_occurred_at_idx on public.mkc_error_logs (occurred_at desc);
create index mkc_error_logs_resolved_idx on public.mkc_error_logs (resolved) where not resolved;
create index mkc_error_logs_digest_idx on public.mkc_error_logs (digest);

create table public.mkc_performance_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_name text not null check (metric_name in ('CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB')),
  value double precision not null,
  rating text not null check (rating in ('good', 'needs-improvement', 'poor')),
  url text,
  user_id uuid references public.employees (id) on delete set null,
  environment text not null default 'production',
  created_at timestamptz not null default now()
);

create index mkc_performance_metrics_name_created_idx on public.mkc_performance_metrics (metric_name, created_at desc);

-- Rolling 7-day summary (count, average, p75 per Web Vitals convention) so
-- the monitoring dashboard shows aggregated numbers instead of raw rows.
create view public.v_performance_summary as
select
  metric_name,
  count(*) as sample_count,
  avg(value) as avg_value,
  percentile_cont(0.75) within group (order by value) as p75_value,
  count(*) filter (where rating = 'poor') as poor_count
from public.mkc_performance_metrics
where created_at > now() - interval '7 days'
group by metric_name;

alter table public.mkc_error_logs enable row level security;
alter table public.mkc_performance_metrics enable row level security;

-- Writes happen exclusively through the service-role client from server
-- actions / the instrumentation hook (never directly from the browser), so
-- there is no insert policy here — RLS denies by default and the
-- service-role key bypasses RLS entirely for that trusted write path.
create policy mkc_error_logs_select on public.mkc_error_logs for select to authenticated
  using (public.app_has_permission('system.monitoring_view'));
create policy mkc_error_logs_update on public.mkc_error_logs for update to authenticated
  using (public.app_has_permission('system.monitoring_view'))
  with check (public.app_has_permission('system.monitoring_view'));

create policy mkc_performance_metrics_select on public.mkc_performance_metrics for select to authenticated
  using (public.app_has_permission('system.monitoring_view'));

grant select on public.v_performance_summary to authenticated;

-- Lightweight, unauthenticated database round-trip for uptime monitors /
-- load balancers. Returns no application data, so it's safe to expose to
-- anon.
create or replace function public.health_check()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'time', now(),
    'server_version', current_setting('server_version')
  );
$$;

grant execute on function public.health_check() to anon, authenticated;

insert into public.permissions (key, description) values
  ('system.monitoring_view', 'View system health, error logs and performance metrics')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin' and p.key = 'system.monitoring_view'
on conflict do nothing;
