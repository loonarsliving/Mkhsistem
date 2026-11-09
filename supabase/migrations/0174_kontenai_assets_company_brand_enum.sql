-- ============================================================================
-- MK Connect — 0174: KontenAI Asset Library -- lock `company` to the brand
-- catalog Asset Selector actually filters on
--
-- `company` started as free text (0157) so uploaders could type "Leasehold",
-- "villa", "VILLA OCCUPANCY" etc. -- Asset Selector (select-assets.actions.ts)
-- now hard-filters the candidate pool by this column before ranking scenes
-- against it, matched against a storyboard's creative brief `content_focus`
-- (features/kontenai/types.ts ContentFocus: general/leasehold_sales/
-- occupancy/beauty -- the same catalog constants/app.ts CONTENT_FOCUS_VALUES
-- already uses for briefs). Free text defeats that filter the moment two
-- uploaders spell a brand differently, so `company` now stores the exact
-- ContentFocus slug instead of a human label (the UI shows BRAND_LABELS[value]).
--
-- Backfilled the 19 existing Drive-sourced rows to 'occupancy' before adding
-- this (they're all Villa footage -- see asset-library Drive folder audit).
-- Nullable stays allowed: legacy/general assets not yet brand-scoped.
-- ============================================================================

alter table public.kontenai_assets
  add constraint kontenai_assets_company_check
    check (company is null or company in ('general', 'leasehold_sales', 'occupancy', 'beauty'));

comment on column public.kontenai_assets.company is 'Brand this asset belongs to -- one of ContentFocus (features/kontenai/types.ts): general | leasehold_sales | occupancy | beauty. Asset Selector hard-filters on this column against a storyboard''s creative brief content_focus, so it must match that enum exactly rather than a free-text brand name.';
