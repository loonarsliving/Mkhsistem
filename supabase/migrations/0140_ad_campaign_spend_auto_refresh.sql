-- ============================================================================
-- MK Connect — 0140: Auto-refresh ad campaign spend/impressions/clicks
--
-- Bug found by the owner: the Ads Specialist page's "Spend" figure per
-- campaign (meta_ad_campaigns.spend_idr, added by 0084) only ever updated
-- when a human manually clicked "Analisis"/"Analisis Ulang"
-- (analyzeAdCampaignAction -> app/api/markom/refresh-ad-campaign-spend has
-- no relation to that action, they're independent writers of the same
-- columns) -- there was no automatic refresh at all. A campaign the owner
-- had already funded well over Rp1.000.000 for still showed a stale
-- ~Rp200rb because nobody had re-clicked Analisis since that snapshot was
-- taken, even though the ad kept spending real budget on Meta in the
-- background.
--
-- Fix: a new pg_cron-triggered route (same non-AI, plain-Graph-API-read
-- pattern as check-ads-balance, 0135) refreshes spend/impressions/clicks/
-- conversations_started for every active or paused campaign every 2 hours,
-- independent of whether a human ever clicks Analisis. The AI-written
-- narrative (ai_analysis) is untouched by this -- still generated only on
-- demand, to avoid a Gemini call every run for a field that doesn't need
-- to update that often.
-- ============================================================================

-- Every 2 hours, offset 15 min past the hour so it doesn't collide with the
-- 6-hourly balance check (0135, top of hour).
select cron.schedule(
  'ad-campaign-spend-auto-refresh',
  '15 */2 * * *',
  $$
  select net.http_post(
    url := 'https://mkh.haluoleo.id/api/markom/refresh-ad-campaign-spend',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
