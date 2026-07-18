-- ============================================================================
-- MK Connect — 0113: Staging table for multi-photo WhatsApp relay
--
-- Lets an employee send 2+ photos (e.g. bukti transfer) before/without a
-- caption on every single one, then either caption the last photo or send a
-- follow-up text ("kirim ke Vando dan Edy") to relay ALL of them together
-- in one batch -- instead of only ever being able to relay one photo per
-- caption. Purely internal AI-webhook staging (short-lived, service-role
-- only -- no RLS policy is deliberate, same posture as ai_job_queue).
-- ============================================================================

create table public.wa_pending_media_relay (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index wa_pending_media_relay_sender_idx on public.wa_pending_media_relay (sender, created_at desc);

alter table public.wa_pending_media_relay enable row level security;

-- Sweeps abandoned photos (sent but never followed up with a recipient) so
-- they can never accidentally get swept into a much-later, unrelated relay.
create or replace function public.wa_cleanup_pending_media_relay()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.wa_pending_media_relay where created_at < now() - interval '1 hour';
$$;

select cron.schedule('wa-pending-media-relay-cleanup', '30 * * * *', $$select public.wa_cleanup_pending_media_relay();$$);
