-- ============================================================================
-- MK Connect — 0306: wa-outbox, short public links for files sent on WhatsApp
--
-- Photos Sales send to a WhatsApp lead (0303) never reached Whacenter through
-- the /api/wa-media short link: all 6 sends on 2026-10-25 came back HTTP 500,
-- even after the route served the file with its exact length (#131). Across
-- every file send in ai_integration_logs, the link that works is a plain
-- public Supabase Storage URL (/storage/v1/object/public/..., ~170 chars):
-- 265 successes (promo-templates, project-photos). Signed URLs (?token=) and
-- the app-served link fail.
--
-- So a file to send is copied into this public bucket under a random,
-- unguessable name (<date>/<uuid>.<ext>, written by the service role only)
-- and Whacenter gets that public URL. The original stays in its private
-- bucket. Copies are deleted after a day by the hourly evidence-retention
-- run (/api/hospitality/retention), which asks mkc_wa_outbox_due() for them
-- and removes them through the Storage API.
-- No storage.objects policy: nobody but the service role can write or list;
-- a copy can only be fetched by someone holding its exact URL.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wa-outbox', 'wa-outbox', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Copies older than p_older_than, oldest first (service role, retention run).
create or replace function public.mkc_wa_outbox_due(p_older_than interval default interval '1 day', p_limit integer default 200)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'wa-outbox' and o.created_at < now() - p_older_than
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 200), 1000))
$$;

revoke execute on function public.mkc_wa_outbox_due(interval, integer) from public, anon, authenticated;
grant execute on function public.mkc_wa_outbox_due(interval, integer) to service_role;
