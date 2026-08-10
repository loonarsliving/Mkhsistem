-- AI CCTV module (villa): checkpoint snapshots + Gemini Vision presence detection.
--
-- Owned and consumed entirely by loonarsliving/villa (src/lib/cctvCheckpoint.ts,
-- src/app/api/cctv/*, src/app/api/cron/cctv-checkpoint) -- NOT by Mkhsistem.
-- Recorded here only because supabase/migrations in this repo is this org's
-- single source of truth for schema changes to the shared project
-- svcmybsziaelwwdrnzcv; it was already applied directly via the Supabase MCP
-- (villa has no migration runner of its own) before this file was added.
--
-- EZVIZ cameras (cloud path, open.ezvizlife.com) are captured on a schedule
-- (default every 2 hours, per camera) and the snapshot is sent to Gemini
-- Vision to record only whether a person is visible in the expected zone
-- (security checkpoint / front desk / housekeeping room visit) -- never a
-- judgment of quality, professionalism, or cleanliness, which a still image
-- can't support. Access is restricted in the villa app to a single admin
-- account (Avianto Perdana); RLS here is intentionally policy-less
-- (service-role only), matching the "Service-role only" pattern used by
-- several other tables in this schema (e.g. ai_integration_logs).

create table public.cctv_cameras (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  zona text not null check (zona in ('security', 'front_desk', 'housekeeping')),
  unit_id uuid references public.units(id) on delete set null,
  deskripsi_titik text,
  ezviz_serial text,
  ezviz_channel_no integer not null default 1,
  ezviz_verification_code text,
  checkpoint_interval_minutes integer not null default 120,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cctv_cameras is 'AI CCTV module (villa): EZVIZ cameras registered for periodic checkpoint snapshots. Service-role only.';

create table public.cctv_checkpoint_log (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cctv_cameras(id) on delete cascade,
  captured_at timestamptz not null default now(),
  snapshot_url text,
  person_detected boolean,
  ai_summary text,
  ai_raw jsonb,
  status text not null default 'ok' check (status in ('ok', 'capture_failed', 'ai_failed')),
  error_detail text,
  created_at timestamptz not null default now()
);
comment on table public.cctv_checkpoint_log is 'AI CCTV module (villa): one row per checkpoint snapshot + Gemini Vision presence-detection result. Service-role only.';

create index cctv_checkpoint_log_camera_captured_idx on public.cctv_checkpoint_log (camera_id, captured_at desc);

alter table public.cctv_cameras enable row level security;
alter table public.cctv_checkpoint_log enable row level security;
