-- ============================================================================
-- MK Connect — 0270: Loonars AI Occupancy Ads — Meta Ad Preview + variant
-- follow-ups found while building the Creative Variant / Ad Preview /
-- Decision Engine UI on top of 0268/0269.
--
-- NOT YET APPLIED TO THE LIVE DATABASE — same approval gate as 0268/0269
-- (see those files' headers and docs/project-memory/FEATURES.md). Written
-- for review only; do not edit 0268/0269 to add this, per root CLAUDE.md's
-- "never edit a past migration" rule.
--
-- Two small, additive gaps found once the Meta Ad Preview screen (spec's
-- "META AD PREVIEW" requirement) needed a concrete "this is the creative
-- currently selected for this campaign" pointer instead of re-deriving it
-- from the latest loonars_campaign_briefs row every time:
--
-- 1. loonars_occupancy_campaigns.primary_asset_id — which single creative
--    asset (or approved variant's parent asset) is the one shown in the
--    Ad Preview / used on launch, settable via the preview's "change
--    asset" action. Nullable — a draft fresh from the AI may have zero or
--    several selected_asset_ids and no single "the" asset yet.
-- 2. loonars_occupancy_campaigns.status check constraint widened to add
--    'rejected' — the Ad Preview's "Reject" action (spec) needs a status
--    distinct from 'archived' (soft-delete/cleanup) and 'failed' (a real
--    Meta API failure during launch); reviewers rejecting a draft/review
--    campaign is a normal human decision, not an error state.
-- ============================================================================

alter table public.loonars_occupancy_campaigns
  add column if not exists primary_asset_id uuid references public.loonars_creative_assets(id) on delete set null;

alter table public.loonars_occupancy_campaigns drop constraint if exists loonars_occupancy_campaigns_status_check;
alter table public.loonars_occupancy_campaigns add constraint loonars_occupancy_campaigns_status_check
  check (status in ('draft', 'review', 'approved', 'rejected', 'ready_for_meta', 'active', 'paused', 'completed', 'archived', 'failed'));
