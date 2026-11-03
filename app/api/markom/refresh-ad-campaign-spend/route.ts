import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getAdInsights } from "@/lib/meta/ads";
import { isMetaConfigured } from "@/lib/meta/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every 2 hours via pg_cron (migration 0140): refreshes spend/impressions/
 * clicks/conversations_started for every launched (active or paused)
 * campaign directly from Meta's Graph API -- a plain read, no Gemini call.
 * Previously these numbers only ever updated when a human manually clicked
 * "Analisis"/"Analisis Ulang" (analyzeAdCampaignAction) -- with no
 * automatic refresh at all, the figure shown on /markom/ads could silently
 * go stale for days while the campaign kept spending real budget on Meta.
 * analyzed_at is bumped here too (not just by manual analysis) so the
 * numbers reliably show up on the page the moment a campaign launches,
 * without waiting on a human to click Analisis first -- the AI-written
 * narrative (ai_analysis) is intentionally left untouched, since that
 * still only regenerates on demand to avoid an unnecessary Gemini call
 * every run.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  if (!isMetaConfigured()) {
    return NextResponse.json({ status: "skipped", reason: "not_configured" });
  }

  const supabase = createAdminClient();

  const { data: campaigns, error } = await supabase
    .from("meta_ad_campaigns")
    .select("id, meta_ad_id")
    .in("status", ["active", "paused"])
    .not("meta_ad_id", "is", null);

  if (error) {
    logger.error("refresh-ad-campaign-spend: failed to load campaigns", { error: error.message });
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  let refreshed = 0;
  for (const campaign of campaigns ?? []) {
    if (!campaign.meta_ad_id) continue;
    try {
      const insights = await getAdInsights(campaign.meta_ad_id);
      const { error: updateError } = await supabase
        .from("meta_ad_campaigns")
        .update({
          spend_idr: insights.spendIdr,
          impressions: insights.impressions,
          clicks: insights.clicks,
          conversations_started: insights.messagingConversationsStarted,
          analyzed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);
      if (updateError) throw new Error(updateError.message);
      refreshed += 1;
    } catch (err) {
      logger.error("refresh-ad-campaign-spend: failed for campaign", {
        campaignId: campaign.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const scheduleEnded = await markScheduledCampaignsEnded(supabase);

  return NextResponse.json({ status: "done", refreshed, total: (campaigns ?? []).length, scheduleEnded });
}

/**
 * Iklan berjadwal (migrasi 0312): Meta sudah berhenti sendiri di end_time
 * ad set, tapi status lokal masih 'active'/'paused'. Dijalankan SETELAH
 * refresh spend di atas supaya angka belanja terakhir ikut tersimpan.
 * Ads Specialist → 'ended' (juga membuat AI dispatch 0253 tidak meluncurkan
 * iklan baru otomatis untuk project itu); Occupancy Ads → 'completed'.
 * Hanya update DB, tidak ada panggilan Meta (ad set-nya sudah tidak tayang).
 */
async function markScheduledCampaignsEnded(supabase: ReturnType<typeof createAdminClient>) {
  const nowIso = new Date().toISOString();
  const result = { adsSpecialist: 0, occupancyAds: 0 };

  const { data: endedAds, error: adsError } = await supabase
    .from("meta_ad_campaigns")
    .update({ status: "ended", updated_at: nowIso })
    .in("status", ["active", "paused"])
    .not("ends_at", "is", null)
    .lte("ends_at", nowIso)
    .select("id");
  if (adsError) logger.error("refresh-ad-campaign-spend: failed to mark scheduled ads ended", { error: adsError.message });
  else result.adsSpecialist = endedAds?.length ?? 0;

  // loonars_occupancy_campaigns belum ada di types/database.types.ts (pola
  // yang sama dengan repositories/occupancy-ads.repository.ts's db()).
  const untyped = supabase as unknown as SupabaseClient;
  const { data: endedOccupancy, error: occupancyError } = await untyped
    .from("loonars_occupancy_campaigns")
    .update({ status: "completed" })
    .in("status", ["active", "paused"])
    .not("ends_at", "is", null)
    .lte("ends_at", nowIso)
    .select("id");
  if (occupancyError) logger.error("refresh-ad-campaign-spend: failed to mark scheduled occupancy campaigns completed", { error: occupancyError.message });
  else result.occupancyAds = endedOccupancy?.length ?? 0;

  return result;
}
