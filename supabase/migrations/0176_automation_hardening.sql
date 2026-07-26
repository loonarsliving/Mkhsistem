-- ============================================================================
-- MK Connect — 0176: Automation hardening (auth, observability, alerting)
--
-- Audit of the automation layer (55 pg_cron jobs + 2 notification triggers)
-- found three structural gaps. None of them is a bug in any individual
-- automation; they are all properties of how every automation dispatches.
--
-- GAP 1 — Every dispatch target was an unauthenticated public endpoint.
--   Ten routes on https://mkh.haluoleo.id are called by pg_cron/triggers
--   with no credential of any kind. Eight of them take no arguments at
--   all: POST {} to /api/crm/dispatch-promo-sends sends a WhatsApp batch,
--   /api/social/publish-content publishes to Instagram/TikTok,
--   /api/ai/voice-bridge/daily-digest and /api/ai/branch-balance-advisory
--   spend Gemini tokens. The anti-ban pacing those workers implement
--   (BATCH_SIZE per 5-minute tick) only holds if the tick rate is
--   controlled by pg_cron -- anyone looping the URL bypassed it.
--   Fix: automation_post() below attaches an x-cron-secret header that
--   lib/security/cron-auth.ts verifies.
--
-- GAP 2 — Dispatch was fire-and-forget and unobserved.
--   net.http_post() returns immediately, so cron.job_run_details recorded
--   'succeeded' for every HTTP-dispatch job even when the endpoint
--   returned 500 or never answered. Nothing anywhere read
--   net._http_response. A Vercel outage, a bad deploy, or an expired Meta
--   token would have shown a wall of green in the job history.
--   Fix: automation_dispatch_log + automation_collect_dispatch_results().
--
-- GAP 3 — Failures were silent.
--   ai_job_queue rows that exhaust their retries land in 'dead_letter' and
--   nobody is told. Four such rows were sitting in production unnoticed --
--   including one from 2026-07-13 whose error was "Gemini model
--   gemini-2.5-flash-lite is no longer available", i.e. a whole class of
--   AI replies was failing and the only record was a table nobody reads.
--   Fix: check_automation_health() alerts Super Admins, once per episode.
--
-- Also folded in: the production URL was hardcoded in 5 functions and 6
-- cron job bodies, so there was no way to point a staging database at a
-- staging deployment. It now comes from automation_config.
--
-- ROLLOUT IS FAIL-OPEN AND ORDER-INDEPENDENT. Until an operator sets a
-- non-empty cron_secret here AND CRON_SECRET in Vercel, the header is
-- simply absent and the routes accept requests exactly as they do today.
-- Setting one side before the other does not cause an outage: the app only
-- enforces when its own env var is set, and the database only sends when
-- its own config row is set.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- automation_config: the single source of truth for where automations
-- dispatch to and what credential they present. One row, enforced by a
-- boolean primary key defaulted to true.
--
-- No RLS policies are defined on purpose: with RLS enabled and zero
-- policies, PostgREST returns nothing to anon/authenticated no matter what
-- token they hold. The grants below are revoked to match, so the secret is
-- reachable only by the definer functions in this file (owned by postgres)
-- and by service_role, which already holds every credential in the system.
-- ----------------------------------------------------------------------------
create table if not exists public.automation_config (
  id boolean primary key default true check (id),
  app_base_url text not null default 'https://mkh.haluoleo.id',
  cron_secret text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.automation_config enable row level security;
revoke all on public.automation_config from anon, authenticated;

insert into public.automation_config (id) values (true) on conflict (id) do nothing;

comment on table public.automation_config is
  'Single-row config for the automation dispatch layer: base URL every pg_cron/trigger HTTP call targets, and the shared secret sent as x-cron-secret. RLS on with no policies -- definer functions and service_role only. Set cron_secret to the same value as the app''s CRON_SECRET env var to switch the automation endpoints from open to authenticated.';

-- ----------------------------------------------------------------------------
-- automation_dispatch_log: one row per outbound automation HTTP call, so
-- the fire-and-forget dispatch in GAP 2 becomes auditable. request_id is
-- pg_net's handle; automation_collect_dispatch_results() below joins it
-- back to net._http_response once the response lands.
-- ----------------------------------------------------------------------------
create table if not exists public.automation_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  request_id bigint not null,
  path text not null,
  dispatched_at timestamptz not null default now(),
  resolved_at timestamptz,
  status_code int,
  timed_out boolean,
  error_msg text
);

alter table public.automation_dispatch_log enable row level security;
revoke all on public.automation_dispatch_log from anon, authenticated;

create index if not exists automation_dispatch_log_unresolved_idx
  on public.automation_dispatch_log (dispatched_at) where resolved_at is null;
create index if not exists automation_dispatch_log_path_time_idx
  on public.automation_dispatch_log (path, dispatched_at desc);

comment on table public.automation_dispatch_log is
  'One row per outbound pg_cron/trigger HTTP dispatch, resolved against net._http_response by automation_collect_dispatch_results(). Exists because net.http_post is fire-and-forget: without this, cron.job_run_details reports success for a dispatch whose endpoint returned 500.';

-- ----------------------------------------------------------------------------
-- automation_post(): the one way an automation is allowed to call the app.
--
-- Replaces every direct net.http_post() call in the automation layer. Reads
-- the base URL and secret from automation_config, records the dispatch, and
-- returns pg_net's request id. The x-cron-secret header is omitted entirely
-- when the secret is empty, which is what keeps this rollout fail-open.
-- ----------------------------------------------------------------------------
create or replace function public.automation_post(
  p_path text,
  p_body jsonb default '{}'::jsonb,
  p_timeout_ms int default 15000
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cfg public.automation_config%rowtype;
  v_headers jsonb;
  v_request_id bigint;
begin
  select * into v_cfg from public.automation_config where id limit 1;
  if not found then
    v_cfg.app_base_url := 'https://mkh.haluoleo.id';
    v_cfg.cron_secret := '';
  end if;

  v_headers := jsonb_build_object('Content-Type', 'application/json');
  if coalesce(v_cfg.cron_secret, '') <> '' then
    v_headers := v_headers || jsonb_build_object('x-cron-secret', v_cfg.cron_secret);
  end if;

  select net.http_post(
    url := v_cfg.app_base_url || p_path,
    headers := v_headers,
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := p_timeout_ms
  ) into v_request_id;

  insert into public.automation_dispatch_log (request_id, path)
  values (v_request_id, p_path);

  return v_request_id;
end;
$$;

comment on function public.automation_post is
  'The single dispatch path from Postgres to the app: resolves base URL + x-cron-secret from automation_config, fires via pg_net, and records the request in automation_dispatch_log for later resolution. Never call net.http_post directly from an automation -- doing so re-opens the unauthenticated and unobserved dispatch this replaces.';

-- ============================================================================
-- Repoint every existing dispatcher at automation_post().
--
-- Each function below is restated verbatim from its live definition with
-- exactly one change: the net.http_post(...) call becomes automation_post().
-- No routing, filtering, or category logic is touched.
-- ============================================================================

-- 0054 / 0052: web push fan-out on every notification insert.
create or replace function public.mkc_notifications_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.automation_post('/api/push/send', jsonb_build_object('notification_id', new.id), 5000);
  return new;
end;
$$;

-- 0063 / 0106 / 0174: WhatsApp relay for notification categories that
-- should reach the recipient's phone, not just the in-app bell. Category
-- list is unchanged except for the three automation-alert categories added
-- by this migration -- an automation outage has to reach a Super Admin's
-- phone, since the whole point is that nobody is watching the dashboard.
create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout',
    'new_memo',
    'target_reminder',
    'weekly_reminder', 'markom_new_task', 'task_revision',
    'payroll_available',
    'waiting_approval',
    'project_progress', 'material_request', 'inspection_reminder',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    'lead_wants_info',
    'loonars_fee_alert',
    -- This migration
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;

-- 0065: immediate dispatch on ai_job_queue insert (low-latency path).
create or replace function public.ai_job_queue_dispatch_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.automation_post('/api/ai/process-job', jsonb_build_object('job_id', new.id), 25000);
  return new;
end;
$$;

-- 0065: every-minute sweep that re-dispatches pending jobs the trigger
-- missed, and jobs the route itself rescheduled after a retryable failure.
create or replace function public.ai_job_dispatch_pending()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
begin
  for v_row in
    select id from public.ai_job_queue
    where status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at
    limit 20
  loop
    perform public.automation_post('/api/ai/process-job', jsonb_build_object('job_id', v_row.id), 25000);
  end loop;
end;
$$;

-- 0098: daily branch balance advisory.
create or replace function public.trigger_branch_balance_advisory_check()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.automation_post('/api/ai/branch-balance-advisory', '{}'::jsonb, 20000);
end;
$$;

-- ----------------------------------------------------------------------------
-- The six cron jobs that inlined net.http_post in their command bodies
-- rather than calling a function. Same schedules, same timeouts -- only the
-- dispatch mechanism changes.
-- ----------------------------------------------------------------------------
select cron.unschedule('crm-promo-sends-worker');
select cron.schedule('crm-promo-sends-worker', '*/5 * * * *',
  $$select public.automation_post('/api/crm/dispatch-promo-sends', '{}'::jsonb, 15000);$$);

select cron.unschedule('markom-content-publish-worker');
select cron.schedule('markom-content-publish-worker', '*/5 * * * *',
  $$select public.automation_post('/api/social/publish-content', '{}'::jsonb, 45000);$$);

select cron.unschedule('social-daily-snapshot-capture');
select cron.schedule('social-daily-snapshot-capture', '0 23 * * *',
  $$select public.automation_post('/api/social/capture-snapshots', '{}'::jsonb, 15000);$$);

select cron.unschedule('meta-ads-balance-check');
select cron.schedule('meta-ads-balance-check', '0 */6 * * *',
  $$select public.automation_post('/api/markom/check-ads-balance', '{}'::jsonb, 15000);$$);

select cron.unschedule('ad-campaign-spend-auto-refresh');
select cron.schedule('ad-campaign-spend-auto-refresh', '15 */2 * * *',
  $$select public.automation_post('/api/markom/refresh-ad-campaign-spend', '{}'::jsonb, 30000);$$);

select cron.unschedule('voice-bridge-daily-digest');
select cron.schedule('voice-bridge-daily-digest', '0 9 * * *',
  $$select public.automation_post('/api/ai/voice-bridge/daily-digest', '{}'::jsonb, 60000);$$);

-- ============================================================================
-- Observability + alerting
-- ============================================================================

alter table public.mkc_notifications drop constraint mkc_notifications_category_check;
alter table public.mkc_notifications add constraint mkc_notifications_category_check
  check (category is null or category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout', 'leave_approved', 'leave_rejected', 'payroll_available',
    'new_prospect', 'follow_up_reminder', 'new_assignment', 'closing_approved', 'customer_verification', 'target_reminder',
    'markom_new_task', 'task_revision', 'task_approved', 'weekly_reminder',
    'project_progress', 'material_request', 'inspection_reminder',
    'payment_received', 'invoice_due', 'reimbursement_approved',
    'waiting_approval', 'approved', 'rejected',
    'new_announcement', 'new_memo',
    'maintenance', 'version_update', 'emergency_notice',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead', 'content_published', 'content_publish_reminder',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    'content_publish_failed',
    'database_followup_push',
    'lead_wants_info',
    'loonars_fee_alert',
    -- This migration: automation self-monitoring
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled'
  ]));

-- ----------------------------------------------------------------------------
-- automation_collect_dispatch_results(): closes GAP 2. Mirrors the shape of
-- sync_collect_responses() (0055) -- reads back pg_net responses for rows
-- this layer dispatched and records the real outcome.
--
-- pg_net prunes net._http_response after a few hours, so anything still
-- unresolved after 30 minutes is recorded as a lost response rather than
-- left open forever waiting for a row that will never arrive.
-- ----------------------------------------------------------------------------
create or replace function public.automation_collect_dispatch_results()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.automation_dispatch_log d
    set status_code = r.status_code,
        timed_out = r.timed_out,
        error_msg = r.error_msg,
        resolved_at = now()
  from net._http_response r
  where r.id = d.request_id
    and d.resolved_at is null;

  update public.automation_dispatch_log
    set resolved_at = now(),
        error_msg = 'no pg_net response recorded within 30 minutes'
    where resolved_at is null
      and dispatched_at < now() - interval '30 minutes';

  delete from public.automation_dispatch_log where dispatched_at < now() - interval '14 days';
exception
  when insufficient_privilege then
    -- net._http_response is not readable in this deployment; leave rows
    -- unresolved rather than failing the cron job outright.
    return;
end;
$$;

comment on function public.automation_collect_dispatch_results is
  'Every 5 minutes: resolves automation_dispatch_log rows against net._http_response so a failed HTTP dispatch stops looking like a successful cron run. Prunes the log after 14 days.';

select cron.schedule('automation-collect-dispatch-results', '*/5 * * * *',
  $$select public.automation_collect_dispatch_results();$$);

-- ----------------------------------------------------------------------------
-- check_automation_health(): closes GAP 3. Hourly Super Admin alerting for
-- the three failure modes that were previously silent. Follows the
-- episode-dedup pattern established by check_whatsapp_webhook_health()
-- (0106) -- alert once when a problem starts, not once an hour while it
-- persists, so this can never become noise the team learns to ignore.
-- ----------------------------------------------------------------------------
create or replace function public.check_automation_health()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin record;
  v_failed_dispatches int;
  v_failed_paths text;
  v_dead_letters int;
  v_dead_letter_types text;
  v_stalled int;
begin
  -- (a) HTTP dispatches that came back non-2xx, timed out, or never
  -- answered in the last hour.
  select count(*), string_agg(distinct path, ', ')
    into v_failed_dispatches, v_failed_paths
  from public.automation_dispatch_log
  where resolved_at >= now() - interval '1 hour'
    and (status_code is null or status_code >= 400 or timed_out);

  if coalesce(v_failed_dispatches, 0) > 0
     and not exists (
       select 1 from public.mkc_notifications
       where category = 'automation_dispatch_failed' and created_at >= now() - interval '6 hours'
     ) then
    for v_admin in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_admin.id, 'system', 'automation_dispatch_failed',
        'Otomasi gagal terkirim',
        v_failed_dispatches || ' panggilan otomasi gagal dalam 1 jam terakhir (' || coalesce(v_failed_paths, '-')
          || '). Kemungkinan aplikasi sedang down, deploy bermasalah, atau CRON_SECRET tidak cocok antara Vercel dan automation_config.',
        '/monitoring'
      );
    end loop;
  end if;

  -- (b) ai_job_queue rows that gave up. Previously these accumulated with
  -- nobody informed -- the reason a deprecated Gemini model went unnoticed.
  select count(*), string_agg(distinct job_type, ', ')
    into v_dead_letters, v_dead_letter_types
  from public.ai_job_queue
  where status = 'dead_letter' and updated_at >= now() - interval '1 hour';

  if coalesce(v_dead_letters, 0) > 0
     and not exists (
       select 1 from public.mkc_notifications
       where category = 'automation_job_dead_letter' and created_at >= now() - interval '6 hours'
     ) then
    for v_admin in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_admin.id, 'system', 'automation_job_dead_letter',
        'Job AI berhenti permanen',
        v_dead_letters || ' job AI masuk dead letter dalam 1 jam terakhir (' || coalesce(v_dead_letter_types, '-')
          || '). Job ini tidak akan dicoba ulang otomatis -- cek alasannya di Monitoring.',
        '/monitoring'
      );
    end loop;
  end if;

  -- (c) The dispatch loop itself has stopped draining the queue. Jobs are
  -- pending, their next_attempt_at is well past, and the every-minute sweep
  -- has evidently not been reaching the route.
  select count(*) into v_stalled
  from public.ai_job_queue
  where status = 'pending' and next_attempt_at < now() - interval '30 minutes';

  if coalesce(v_stalled, 0) > 0
     and not exists (
       select 1 from public.mkc_notifications
       where category = 'automation_queue_stalled' and created_at >= now() - interval '6 hours'
     ) then
    for v_admin in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_admin.id, 'system', 'automation_queue_stalled',
        'Antrian job AI macet',
        v_stalled || ' job AI tertahan status pending lebih dari 30 menit. Dispatcher tidak berhasil memanggil /api/ai/process-job.',
        '/monitoring'
      );
    end loop;
  end if;
end;
$$;

comment on function public.check_automation_health is
  'Hourly: alerts every Super Admin, once per 6-hour episode, on failed automation dispatches, newly dead-lettered AI jobs, and a stalled ai_job_queue. These three conditions were previously only visible to someone who thought to query the tables directly.';

select cron.schedule('automation-health-hourly', '20 * * * *',
  $$select public.check_automation_health();$$);

-- ----------------------------------------------------------------------------
-- v_automation_health: what the Monitoring page should show for the
-- automation layer -- per-endpoint success rate over 24 hours. Replaces
-- cron.job_run_details, which reports success for a dispatch that 500'd.
-- ----------------------------------------------------------------------------
create or replace view public.v_automation_health as
select
  path,
  count(*) as dispatches_24h,
  count(*) filter (where status_code between 200 and 299) as ok_24h,
  count(*) filter (where status_code >= 400) as http_error_24h,
  count(*) filter (where timed_out) as timeout_24h,
  count(*) filter (where resolved_at is null) as pending_24h,
  max(dispatched_at) as last_dispatch_at,
  max(dispatched_at) filter (where status_code between 200 and 299) as last_success_at
from public.automation_dispatch_log
where dispatched_at >= now() - interval '24 hours'
group by path;

comment on view public.v_automation_health is
  'Per-endpoint automation dispatch health over 24h. The honest version of cron.job_run_details for HTTP-dispatch jobs.';

revoke all on public.v_automation_health from anon, authenticated;
