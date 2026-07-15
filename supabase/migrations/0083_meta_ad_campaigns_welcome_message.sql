-- ============================================================================
-- MK Connect — 0083: meta_ad_campaigns gains welcome_message
--
-- The research-only draft flow (0082) needs to persist the AI's drafted
-- WhatsApp greeting so the later, separate "Luncurkan" step
-- (launchDraftCampaignAction) reuses the exact drafted content instead of
-- regenerating it (or silently dropping it) at launch time.
-- ============================================================================

alter table public.meta_ad_campaigns add column welcome_message text;
comment on column public.meta_ad_campaigns.welcome_message is 'AI-drafted WhatsApp greeting shown when a lead opens the chat from the ad -- saved at research/draft time so launchDraftCampaignAction reuses the exact drafted content instead of regenerating it.';
