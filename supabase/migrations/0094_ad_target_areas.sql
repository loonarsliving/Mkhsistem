-- AI-researched buyer-origin areas for non-villa (e.g. perumahan) projects.
-- Villa projects keep using the fixed LEASEHOLD_TARGET_CITIES list
-- (lib/meta/ads.ts) since that's real curated market knowledge already.
-- Non-villa projects have no such list -- researchAndDraftAd now researches
-- (Google Search grounding) where buyers of a property in that specific
-- location typically come from, and this column persists that result so the
-- later "Luncurkan" click (a separate action, no second AI call) can resolve
-- it into real Meta geo targeting.
alter table public.meta_ad_campaigns add column target_areas text[];
