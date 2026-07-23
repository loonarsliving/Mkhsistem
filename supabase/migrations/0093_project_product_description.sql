-- ============================================================================
-- MK Connect — 0093: Product description for AI ad research
--
-- The AI ad-drafting pipeline (researchAndDraftAd, lib/ai/domains/markom.ts)
-- only ever had project name/city/type + a per-photo caption to work with --
-- nothing about the actual product being sold (unit specs, price range,
-- unique selling points, target buyer). Markom now sets this once per
-- project (edited from the same Photo Gallery screen photos are uploaded
-- from) and every future ad research/draft for that project is grounded in
-- it, instead of the AI guessing generic property copy.
-- ============================================================================

alter table public.crm_projects add column product_description text;
