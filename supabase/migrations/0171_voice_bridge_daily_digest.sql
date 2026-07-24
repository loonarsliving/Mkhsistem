-- ============================================================================
-- MK Connect — 0171: Voice bridge daily digest
--
-- Ultron (the voice assistant) answers most questions by calling Gemini with
-- tool access to live MK Connect data (see app/api/ai/voice-assistant). The
-- owner asked for a cheaper path for "how are things today" style
-- questions: once a day, one Gemini call writes a short spoken-friendly
-- Indonesian summary of the day's MK Connect activity (attendance,
-- notable memos, pending leave/payments, social media audit, monitoring
-- errors) and stores it here. Ultron fetches the latest row directly
-- (a plain table read, not a Gemini call) and can recite it instantly for
-- "ringkasan hari ini" style questions -- anything more specific still goes
-- through the normal Gemini + tool-calling path, unchanged.
-- ============================================================================

create table public.voice_bridge_daily_digests (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  digest_text text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index voice_bridge_daily_digests_generated_at_idx on public.voice_bridge_daily_digests (generated_at desc);

alter table public.voice_bridge_daily_digests enable row level security;

-- Writes happen exclusively through the service-role client from the
-- pg_cron-triggered route below (never directly from the browser), so
-- there is no insert policy here -- RLS denies by default and the
-- service-role key bypasses RLS entirely for that trusted write path.
create policy voice_bridge_daily_digests_select on public.voice_bridge_daily_digests for select to authenticated
  using (public.app_has_permission('voice_bridge.digest_view'));

insert into public.permissions (key, description) values
  ('voice_bridge.digest_view', 'View the voice bridge daily digest (Ultron)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin' and p.key = 'voice_bridge.digest_view'
on conflict do nothing;

-- Generated at 17:00 WITA (09:00 UTC) daily -- "sore", after the work day's
-- attendance/memo/audit activity has mostly settled but before end of day.
select cron.schedule(
  'voice-bridge-daily-digest',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://mkh.haluoleo.id/api/ai/voice-bridge/daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
