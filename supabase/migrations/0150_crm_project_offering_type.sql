-- ============================================================================
-- MK Connect — 0150: crm_projects.offering_type
--
-- Real bug found: a project literally named "Property management" (branch
-- Management Property, code 'MP') was tagged project_type = 'villa' --
-- the closest fit available, since there was no other option -- and the AI
-- ads-drafting pipeline (lib/ai/domains/markom.ts's researchAndDraftAd)
-- unconditionally treats project_type = 'villa' as "villa leasehold for
-- sale to investors", both in copy (audience/hook language) and real Meta
-- geo-targeting (LEASEHOLD_TARGET_CITIES). Result: a draft ad for a
-- property-MANAGEMENT SERVICE got written as "Investasi Villa Produktif di
-- Jogja...Miliki villa...proyeksi ROI Anda" -- a villa-for-sale pitch,
-- completely wrong for a service sold to property owners. Caught before
-- launch (status was still 'draft', no spend).
--
-- offering_type is independent from project_type (asset category): a villa
-- project can be for sale, for short-stay booking, or (this case) managed
-- as a service on the owner's behalf. Default 'sale' preserves every
-- existing project's current behavior untouched.
-- ============================================================================

alter table public.crm_projects
  add column offering_type text not null default 'sale'
    check (offering_type in ('sale', 'rental_stay', 'management_service'));

comment on column public.crm_projects.offering_type is 'What this project actually sells -- sale (villa/unit purchase, the pre-existing default/only behavior), rental_stay (guest/traveler booking), management_service (B2B: we manage the property for its owner). Drives ad copy framing and Meta geo-targeting in lib/ai/domains/markom.ts''s researchAndDraftAd.';

-- Fix the one project that triggered this: Property management (Management
-- Property branch) is a management service, not a villa sale.
update public.crm_projects
set offering_type = 'management_service'
where id = '25d8d07f-82eb-4923-b4b0-1bab103514bf';

-- Delete the wrong draft ad this bug produced -- still 'draft' (never
-- launched, no Meta objects, no spend), so a hard delete is safe and
-- orphans nothing (meta_ad_campaign_photos cascades on delete, see 0141).
delete from public.meta_ad_campaigns
where project_id = '25d8d07f-82eb-4923-b4b0-1bab103514bf' and status = 'draft';
