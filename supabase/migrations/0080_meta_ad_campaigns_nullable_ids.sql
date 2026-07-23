-- ============================================================================
-- MK Connect — 0080: meta_ad_campaigns object-id columns become nullable
--
-- Failed launches (status = 'failed') never get every Meta-side object
-- created (e.g. the campaign succeeds but the ad creative call fails) --
-- these columns must be nullable so a failure record doesn't need to fake
-- empty-string IDs for steps that never ran.
-- ============================================================================

alter table public.meta_ad_campaigns
  alter column meta_campaign_id drop not null,
  alter column meta_adset_id drop not null,
  alter column meta_creative_id drop not null,
  alter column meta_ad_id drop not null;
