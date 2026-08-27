-- ============================================================================
-- MK Connect — 0246: KontenAI local Mac Mini storage provider
--
-- Owner's ask: footage (villa/property video source material) should be
-- storable on a local Mac Mini's SSD instead of only Supabase Storage or
-- Google Drive -- physical file stays on the Mac Mini, only metadata (and,
-- for local_mac, a pointer into the separate `Filemanager` repo's own
-- catalog) lives here. This widens the existing storage_provider dimension
-- (added in 0167 for Google Drive) rather than inventing a parallel
-- taxonomy -- kontenai_assets' company/project/campaign/tags/ai_* columns
-- are unchanged and keep meaning exactly what they already mean.
--
-- For storage_provider = 'local_mac', storage_path holds the Filemanager
-- agent's own numeric file id (stringified) -- NOT a filesystem path.
-- Resolving it to actual bytes is provider-specific, same as today's
-- google_drive rows (storage_path there is a Drive file id, not a path
-- either): see lib/kontenai/asset-source.ts.
--
-- public_url is relaxed to nullable: a local_mac asset has no durable
-- public URL the way a Supabase Storage or "anyone with the link" Drive
-- file does -- the only way to fetch its bytes is a short-lived,
-- single-use delivery link minted on demand
-- (lib/filemanager/client.ts's getFilemanagerDeliverLink), which would be
-- stale the moment it's stored. Every existing row already has a real
-- public_url, so relaxing NOT NULL is purely additive -- it changes
-- nothing about how any existing supabase/google_drive row is read.
-- ============================================================================

alter table public.kontenai_assets
  alter column public_url drop not null;

alter table public.kontenai_assets
  drop constraint kontenai_assets_storage_provider_check;

alter table public.kontenai_assets
  add constraint kontenai_assets_storage_provider_check
    check (storage_provider in ('supabase', 'google_drive', 'local_mac'));

comment on column public.kontenai_assets.storage_provider is
  'Which backend storage_path/public_url point into -- supabase (Storage bucket), google_drive (Drive file id + webViewLink), or local_mac (Filemanager repo agent file id on the owner''s Mac Mini SSD; public_url is null for this provider).';
