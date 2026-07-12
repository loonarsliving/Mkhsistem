-- ============================================================================
-- MK Connect — 0055: Cross-system sync foundation (MK Connect <-> MKH Property)
--
-- MK Connect (CRM/HR/Ops) and MKH Property (Finance, a separate Supabase
-- project managed independently by the CFO) must never share a database.
-- Instead we synchronize specific events over HTTP using Postgres triggers
-- (pg_net, already enabled by 0052_web_push_notifications.sql) + a small
-- pg_cron-driven outbox/inbox pattern, so that:
--   - every attempted sync is durably logged (public.sync_log)
--   - duplicate delivery cannot create duplicate financial transactions
--     (idempotency_key is unique; the receiver also dedupes on it)
--   - a failed delivery is retried automatically with backoff, and gives up
--     (dead_letter) after max_attempts so it doesn't retry forever
--
-- This migration only adds the generic sync plumbing. The actual "what
-- triggers a sync" business logic lives in 0056/0057.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- sync_log: append-only outbox/inbox ledger. RLS is enabled with no policies
-- for anon/authenticated, so it is reachable only via SECURITY DEFINER
-- functions and the service role (Edge Functions, pg_cron) — never the app.
-- ----------------------------------------------------------------------------
create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('outbound', 'inbound')),
  event_type text not null,
  source_table text not null,
  source_id uuid not null,
  idempotency_key text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'succeeded', 'failed', 'dead_letter', 'skipped')),
  attempt_count int not null default 0,
  max_attempts int not null default 8,
  last_error text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  request_id bigint,
  target_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

alter table public.sync_log enable row level security;

create index sync_log_dispatch_idx on public.sync_log (next_attempt_at)
  where direction = 'outbound' and status in ('pending', 'failed');
create index sync_log_collect_idx on public.sync_log (request_id)
  where status = 'sent';
create index sync_log_source_idx on public.sync_log (source_table, source_id);

comment on table public.sync_log is
  'Outbound/inbound event log for the MK Connect <-> MKH Property integration. One row per sync attempt-able event; idempotency_key prevents duplicate transactions on retry.';

-- ----------------------------------------------------------------------------
-- sync_config: small non-secret key/value store (peer URL etc). The shared
-- HMAC secret itself is NOT stored here — it lives in Supabase Vault
-- (vault.create_secret, name = 'mk_sync_shared_secret') so it never appears
-- in plaintext in a migration file or git history.
-- ----------------------------------------------------------------------------
create table public.sync_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.sync_config enable row level security;

comment on table public.sync_config is
  'Non-secret sync configuration (peer Edge Function URL, etc). Set via SQL by an operator after deploy; not exposed via PostgREST (RLS, no policies).';

-- ----------------------------------------------------------------------------
-- get_sync_secret(): the `vault` schema is not exposed via PostgREST (by
-- design — Vault must never be queryable over the REST API), so the
-- sync-inbound Edge Function (which only has an HTTP/PostgREST client, no
-- direct Postgres connection) cannot read vault.decrypted_secrets directly.
-- This SECURITY DEFINER wrapper is the one sanctioned way to read the
-- shared secret at request time; EXECUTE is revoked from everyone except
-- service_role, so only the Edge Function's admin client can call it.
-- ----------------------------------------------------------------------------
create or replace function public.get_sync_secret()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'mk_sync_shared_secret';
$$;

revoke execute on function public.get_sync_secret() from public, anon, authenticated;
grant execute on function public.get_sync_secret() to service_role;

-- ----------------------------------------------------------------------------
-- sync_dispatch_pending(): pg_cron job body. Sends any due outbound events to
-- the MKH Property sync-inbound Edge Function via pg_net (async, fire-and-
-- forget from Postgres's point of view — the response is collected later by
-- sync_collect_responses()).
-- ----------------------------------------------------------------------------
create or replace function public.sync_dispatch_pending()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_peer_url text;
  v_secret text;
  v_row record;
  v_req_id bigint;
begin
  select value into v_peer_url from public.sync_config where key = 'peer_sync_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'mk_sync_shared_secret';

  if v_peer_url is null or v_secret is null then
    return; -- not configured yet on this environment
  end if;

  for v_row in
    select *
    from public.sync_log
    where direction = 'outbound'
      and status in ('pending', 'failed')
      and next_attempt_at <= now()
      and attempt_count < max_attempts
    order by created_at
    limit 25
  loop
    select net.http_post(
      url := v_peer_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Sync-Secret', v_secret),
      body := jsonb_build_object(
        'sync_log_id', v_row.id,
        'idempotency_key', v_row.idempotency_key,
        'event_type', v_row.event_type,
        'source_system', 'mk_connect',
        'created_at', v_row.created_at,
        'payload', v_row.payload
      ),
      timeout_milliseconds := 8000
    ) into v_req_id;

    update public.sync_log
      set status = 'sent',
          attempt_count = attempt_count + 1,
          last_attempt_at = now(),
          request_id = v_req_id,
          updated_at = now()
      where id = v_row.id;
  end loop;
end;
$$;

comment on function public.sync_dispatch_pending is
  'Sends due outbound sync_log rows to MKH Property via pg_net. Scheduled every minute by pg_cron.';

-- ----------------------------------------------------------------------------
-- sync_collect_responses(): pg_cron job body. Reads back pg_net responses,
-- marks succeeded/failed, applies exponential backoff, and dead-letters
-- events that exhausted max_attempts.
-- ----------------------------------------------------------------------------
create or replace function public.sync_collect_responses()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
  v_resp record;
begin
  for v_row in select * from public.sync_log where status = 'sent' and request_id is not null
  loop
    select * into v_resp from net._http_response where id = v_row.request_id;

    if not found then
      continue; -- still in flight
    end if;

    if v_resp.status_code between 200 and 299 then
      update public.sync_log
        set status = 'succeeded',
            target_ref = nullif(v_resp.content::jsonb ->> 'target_ref', ''),
            last_error = null,
            updated_at = now()
        where id = v_row.id;
    else
      update public.sync_log
        set status = case when attempt_count >= max_attempts then 'dead_letter' else 'failed' end,
            last_error = left(coalesce(v_resp.content, 'HTTP ' || v_resp.status_code::text), 2000),
            next_attempt_at = now() + (power(2, least(attempt_count, 6)) * interval '1 minute'),
            updated_at = now()
        where id = v_row.id;
    end if;
  end loop;

  -- Requests that never got a pg_net response at all (dropped/timeout) after 5 minutes.
  update public.sync_log
    set status = case when attempt_count >= max_attempts then 'dead_letter' else 'failed' end,
        last_error = 'no response received (timeout)',
        next_attempt_at = now() + (power(2, least(attempt_count, 6)) * interval '1 minute'),
        updated_at = now()
    where status = 'sent'
      and last_attempt_at < now() - interval '5 minutes';
end;
$$;

comment on function public.sync_collect_responses is
  'Collects pg_net responses for sent sync_log rows and retries/dead-letters failures. Scheduled every minute by pg_cron.';

select cron.schedule('sync-dispatch-pending', '*/1 * * * *', $$select public.sync_dispatch_pending()$$);
select cron.schedule('sync-collect-responses', '*/1 * * * *', $$select public.sync_collect_responses()$$);
