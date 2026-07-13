-- ============================================================================
-- MK Connect — 0065: AI Operating System resilience platform
--
-- Turns the WhatsApp AI reply pipeline from "retry synchronously inside the
-- webhook's HTTP handler" (bounded by Vercel's function duration -- a full
-- 20s/40s/80s backoff sequence can exceed it, silently losing the reply even
-- with correct retry code) into a durable async queue: the webhook enqueues
-- a job and acknowledges Meta immediately; a trigger dispatches it right
-- away for the common (healthy) case, and a pg_cron sweep is the safety net
-- for anything the trigger's dispatch didn't reach or that needs to wait out
-- a backoff window. Backoff between attempts is expressed as next_attempt_at
-- (a future dispatch), never an in-process sleep -- so no single serverless
-- invocation ever blocks for more than one Gemini call's timeout.
--
-- Also adds a DB-backed circuit breaker (ai_circuit_breaker_state) and
-- per-attempt telemetry (ai_request_telemetry) — both need to be shared
-- across concurrent Vercel serverless instances, which in-memory state
-- cannot do, so both live here instead of in application memory. State
-- transitions are done inside SECURITY DEFINER functions using row locking
-- (`for update`), so concurrent callers (many simultaneous employees
-- messaging at once) can't race each other into an inconsistent state.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ai_job_queue: the async durable queue. job_type is deliberately narrow
-- today (only the WhatsApp AI reply pipeline is queue-driven) but is a plain
-- text column so a future async AI workflow is an additive new allowed
-- value, not a schema change.
-- ----------------------------------------------------------------------------
create table public.ai_job_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('whatsapp_ai_reply')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt_count int not null default 0,
  max_attempts int not null default 4,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_job_queue enable row level security;
create index ai_job_queue_dispatch_idx on public.ai_job_queue (next_attempt_at) where status = 'pending';

comment on table public.ai_job_queue is
  'Async durable queue for AI workflows that must survive a serverless function timeout (currently: WhatsApp AI reply). Service-role only.';

-- ----------------------------------------------------------------------------
-- ai_circuit_breaker_state: one row per AI provider. closed = normal;
-- open = fast-fail without calling the provider (tripped after
-- consecutive_failures reaches the caller-supplied threshold); half_open =
-- cooldown elapsed, allow one trial call to decide closed vs open again.
-- ----------------------------------------------------------------------------
create table public.ai_circuit_breaker_state (
  provider text primary key,
  state text not null default 'closed' check (state in ('closed', 'open', 'half_open')),
  consecutive_failures int not null default 0,
  opened_at timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ai_circuit_breaker_state enable row level security;

insert into public.ai_circuit_breaker_state (provider) values ('gemini');

comment on table public.ai_circuit_breaker_state is
  'Shared circuit breaker state per AI provider, read/written only via ai_circuit_breaker_check/report (row-locked for concurrency safety across serverless instances). Service-role only.';

-- ----------------------------------------------------------------------------
-- ai_request_telemetry: one row per Gemini call attempt (every attempt, not
-- just failures) -- model/attempt/http status/error body/wait/response time/
-- outcome/circuit state, queryable directly (Vercel log access has been
-- unreliable in practice, this is durable and always queryable via SQL).
-- ----------------------------------------------------------------------------
create table public.ai_request_telemetry (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  job_id uuid references public.ai_job_queue(id) on delete set null,
  attempt int not null,
  max_attempts int not null,
  http_status int,
  error_body text,
  wait_ms int,
  response_time_ms int,
  outcome text not null check (outcome in ('success', 'retrying', 'failed_final', 'model_not_found', 'circuit_open')),
  circuit_state text,
  created_at timestamptz not null default now()
);
alter table public.ai_request_telemetry enable row level security;
create index ai_request_telemetry_created_idx on public.ai_request_telemetry (created_at desc);
create index ai_request_telemetry_outcome_idx on public.ai_request_telemetry (outcome, created_at desc);

comment on table public.ai_request_telemetry is
  'Per-attempt AI provider call telemetry (model/attempt/http status/error body/wait/response time/outcome/circuit state). Service-role only.';

-- ----------------------------------------------------------------------------
-- ai_circuit_breaker_check: read current state, auto-transition
-- open -> half_open once the cooldown has elapsed. Returns whether the
-- caller may proceed with a real provider call.
-- ----------------------------------------------------------------------------
create or replace function public.ai_circuit_breaker_check(p_provider text, p_open_cooldown_ms int default 60000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_circuit_breaker_state%rowtype;
begin
  select * into v_row from public.ai_circuit_breaker_state where provider = p_provider for update;
  if not found then
    insert into public.ai_circuit_breaker_state (provider) values (p_provider)
    returning * into v_row;
  end if;

  if v_row.state = 'open' and v_row.opened_at is not null
     and now() >= v_row.opened_at + make_interval(secs => p_open_cooldown_ms / 1000.0) then
    update public.ai_circuit_breaker_state
      set state = 'half_open', updated_at = now()
      where provider = p_provider
      returning * into v_row;
  end if;

  return jsonb_build_object('allowed', v_row.state <> 'open', 'state', v_row.state, 'consecutive_failures', v_row.consecutive_failures);
end;
$$;

grant execute on function public.ai_circuit_breaker_check(text, int) to service_role;

-- ----------------------------------------------------------------------------
-- ai_circuit_breaker_report: record one call's outcome. A success always
-- fully resets the breaker to closed (including from half_open, per the
-- standard circuit breaker state machine). A failure increments the streak
-- and trips to open once p_failure_threshold consecutive failures is hit --
-- a single row lock (`for update`) makes this safe under concurrent callers.
-- ----------------------------------------------------------------------------
create or replace function public.ai_circuit_breaker_report(p_provider text, p_success boolean, p_failure_threshold int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_circuit_breaker_state%rowtype;
  v_new_failures int;
begin
  select * into v_row from public.ai_circuit_breaker_state where provider = p_provider for update;
  if not found then
    insert into public.ai_circuit_breaker_state (provider) values (p_provider)
    returning * into v_row;
  end if;

  if p_success then
    update public.ai_circuit_breaker_state set
      state = 'closed', consecutive_failures = 0, opened_at = null, last_success_at = now(), updated_at = now()
      where provider = p_provider
      returning * into v_row;
  else
    v_new_failures := v_row.consecutive_failures + 1;
    update public.ai_circuit_breaker_state set
      consecutive_failures = v_new_failures,
      last_failure_at = now(),
      state = case when v_new_failures >= p_failure_threshold then 'open' else state end,
      opened_at = case when v_new_failures >= p_failure_threshold and state <> 'open' then now() else opened_at end,
      updated_at = now()
      where provider = p_provider
      returning * into v_row;
  end if;

  return jsonb_build_object('state', v_row.state, 'consecutive_failures', v_row.consecutive_failures);
end;
$$;

grant execute on function public.ai_circuit_breaker_report(text, boolean, int) to service_role;

-- ----------------------------------------------------------------------------
-- ai_job_queue_dispatch_trigger: fire the job processor immediately on
-- insert, for low latency in the common (healthy) case. Fire-and-forget
-- (pg_net, async) -- if this HTTP call never lands, ai_job_dispatch_pending's
-- cron sweep below is the safety net (the row is still status='pending',
-- so it's picked up on the next sweep regardless of what happened here).
-- ----------------------------------------------------------------------------
create or replace function public.ai_job_queue_dispatch_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://mkh.haluoleo.id/api/ai/process-job',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('job_id', new.id),
    timeout_milliseconds := 25000
  );
  return new;
end;
$$;

create trigger ai_job_queue_after_insert
  after insert on public.ai_job_queue
  for each row execute function public.ai_job_queue_dispatch_trigger();

-- ----------------------------------------------------------------------------
-- ai_job_dispatch_pending: pg_cron sweep (every 1 minute) -- re-dispatches
-- any job still 'pending' whose next_attempt_at has passed, whether that's
-- because the insert trigger's HTTP call never reached the route, or because
-- the job processor deliberately rescheduled it after a retryable failure
-- (next_attempt_at = now() + backoff, set by the route itself -- see
-- app/api/ai/process-job/route.ts). The route's own atomic claim
-- (UPDATE ... WHERE status = 'pending') makes it safe for the trigger and
-- this sweep to both dispatch the same job without double-processing it.
-- ----------------------------------------------------------------------------
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
    perform net.http_post(
      url := 'https://mkh.haluoleo.id/api/ai/process-job',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('job_id', v_row.id),
      timeout_milliseconds := 25000
    );
  end loop;
end;
$$;

select cron.schedule('ai-job-dispatch-pending', '*/1 * * * *', $$select public.ai_job_dispatch_pending();$$);
