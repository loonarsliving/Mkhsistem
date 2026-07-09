-- ============================================================================
-- MK Connect — Login attempt tracking & lockout (brute-force hardening)
-- ============================================================================

create table public.mkc_login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  success boolean not null,
  ip_address text,
  attempted_at timestamptz not null default now()
);

create index mkc_login_attempts_email_time_idx on public.mkc_login_attempts (lower(email), attempted_at desc);

-- No RLS policies: this table is written and read exclusively through the
-- SECURITY DEFINER functions below, callable pre-auth (the visitor has no
-- session yet at login time), so there is nothing to grant on the table
-- itself — RLS denies direct access by default.
alter table public.mkc_login_attempts enable row level security;

create or replace function public.record_login_attempt(p_email text, p_success boolean, p_ip_address text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.mkc_login_attempts (email, success, ip_address)
  values (lower(trim(p_email)), p_success, p_ip_address);
$$;

grant execute on function public.record_login_attempt(text, boolean, text) to anon, authenticated;

-- Locked once an email has 5+ failed attempts within the last 15 minutes.
create or replace function public.check_login_lockout(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select count(*) >= 5
  from public.mkc_login_attempts
  where lower(email) = lower(trim(p_email))
    and not success
    and attempted_at > now() - interval '15 minutes';
$$;

grant execute on function public.check_login_lockout(text) to anon, authenticated;

-- Attempts older than the lockout window are never queried again — prune
-- daily so the table doesn't grow unbounded.
select cron.schedule(
  'prune-login-attempts-daily',
  '0 3 * * *',
  $$delete from public.mkc_login_attempts where attempted_at < now() - interval '1 day';$$
);
