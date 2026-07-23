-- ============================================================================
-- MK Connect — 0151: backfill meta_ad_campaigns.target_areas for
-- leasehold-sale (villa + offering_type='sale') campaigns
--
-- Real display bug found: this column always stored the AI's own separate
-- (and for leasehold sale, never actually researched -- see
-- researchAndDraftAd's areaResearchLine) targetAreas field, not the real
-- deterministic LEASEHOLD_TARGET_CITIES list that ALWAYS gets used for
-- real Meta geo-targeting on these campaigns (lib/meta/ads.ts). Confirmed
-- live against Meta's own API that Yogyakarta (and the rest of the list)
-- genuinely IS being targeted -- this was purely a display gap, not a
-- targeting gap. Backfills existing rows to match; app code (same commit)
-- now sets this correctly going forward.
-- ============================================================================

update public.meta_ad_campaigns mac
set target_areas = array['Yogyakarta', 'Surabaya', 'Bandung', 'Surakarta', 'Bali', 'Malang', 'Semarang']
from public.crm_projects cp
where cp.id = mac.project_id
  and cp.project_type = 'villa'
  and cp.offering_type = 'sale';
