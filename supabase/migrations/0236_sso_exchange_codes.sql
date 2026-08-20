-- ============================================================================
-- MK Connect — 0236: One-time SSO exchange codes for loonars-sales handoff
--
-- Security fix: app/api/sso/loonars-sales previously put the user's real
-- Supabase session JWT (access_token) directly in a redirect URL's query
-- string (?token=...) -- which browsers/proxies/CDNs commonly log, and which
-- lingers in browser history and the Referer header of any subsequent
-- cross-origin navigation from loonars.haluoleo.id/sso. Same posture as
-- wa_pending_media_relay (0113): a short-lived, service-role-only staging
-- table, no RLS policy (nothing but the admin client is meant to touch it).
--
-- The route now redirects with an opaque, unguessable, single-use `code`
-- instead. loonars-sales is expected to exchange it server-to-server via
-- POST /api/sso/loonars-sales/exchange for the real access_token before the
-- code's TTL (60s) elapses or it's consumed once, whichever comes first.
-- ============================================================================

create table public.sso_exchange_codes (
  code text primary key,
  access_token text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table public.sso_exchange_codes enable row level security;

-- Sweeps every code older than its TTL regardless of whether it was ever
-- consumed, so an unclaimed code can't sit around indefinitely.
create or replace function public.sso_cleanup_exchange_codes()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sso_exchange_codes where created_at < now() - interval '5 minutes';
$$;

select cron.schedule('sso-exchange-codes-cleanup', '*/5 * * * *', $$select public.sso_cleanup_exchange_codes();$$);
