-- Asset Library (Sprint 1) moves new uploads from Supabase Storage to Google
-- Drive so every asset lives in one shared Drive instead of scattered across
-- Supabase's storage bucket. storage_provider records which backend a given
-- row's storage_path/public_url point into; existing rows default to
-- 'supabase' (untouched, not migrated), new uploads write 'google_drive'.
-- For 'google_drive' rows, storage_path holds the Drive file id (not a
-- bucket path) and public_url holds Drive's webViewLink.
alter table public.kontenai_assets
  add column storage_provider text not null default 'supabase';

alter table public.kontenai_assets
  add constraint kontenai_assets_storage_provider_check
    check (storage_provider in ('supabase', 'google_drive'));

comment on column public.kontenai_assets.storage_provider is 'Which backend storage_path/public_url point into -- supabase (Storage bucket) or google_drive (Drive file id + webViewLink).';
