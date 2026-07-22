-- ============================================================================
-- MK Connect — 0158: KontenAI Asset Library -- add Location metadata field
--
-- Sprint 1's metadata spec lists Location as its own dimension, distinct
-- from Company/Project/Campaign (e.g. "Yogyakarta", "Villa Cariu site")
-- -- additive column, no impact on existing rows/queries.
-- ============================================================================

alter table public.kontenai_assets add column location text;

create index idx_kontenai_assets_location on public.kontenai_assets (location) where deleted_at is null;

comment on column public.kontenai_assets.location is 'Free-text physical/geographic location the asset relates to (e.g. Yogyakarta, Villa Cariu site) -- distinct from company/project/campaign classification.';
