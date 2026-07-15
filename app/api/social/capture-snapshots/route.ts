import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInstagramConfigured, getInstagramAccountSnapshot, getRecentInstagramMediaPerformance, summarizeBestPostingPattern } from "@/lib/social/instagram";
import { getTikTokAccountSnapshot } from "@/lib/social/tiktok";
import { isTikTokConfigured } from "@/lib/social/tiktok-config";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily own-account performance capture -- triggered by pg_cron via
 * net.http_post (social_run_daily_snapshot_capture, migration 0086), same
 * pattern as /api/ai/whatsapp-relay. Each platform is captured
 * independently and a failure on one never blocks the other -- Instagram
 * being configured and TikTok not yet (or vice versa) is the expected
 * normal state for a while, not an error worth failing the whole request
 * over. impressions doubles as "profile views" for Instagram rows and
 * "video views" for TikTok rows -- see lib/ai/domains/markom.ts's
 * gatherContentPlannerContext/processSocialWeeklyEvaluation, which read it
 * back the same way.
 */
export async function POST() {
  const supabase = createAdminClient();
  const results: Record<string, string> = {};

  if (isInstagramConfigured()) {
    try {
      const [account, media] = await Promise.all([getInstagramAccountSnapshot(), getRecentInstagramMediaPerformance(12)]);
      const { bestHour, topContentType } = summarizeBestPostingPattern(media);
      const totals = media.reduce(
        (acc, m) => ({ likes: acc.likes + m.likes, comments: acc.comments + m.comments, shares: acc.shares + m.shares, saves: acc.saves + m.saves }),
        { likes: 0, comments: 0, shares: 0, saves: 0 },
      );

      await supabase.from("social_account_snapshots").insert({
        platform: "instagram",
        followers_count: account.followersCount,
        reach: account.reach,
        impressions: account.profileViews,
        likes: totals.likes,
        comments: totals.comments,
        shares: totals.shares,
        saves: totals.saves,
        best_upload_hour: bestHour,
        top_content_type: topContentType,
        raw_data: { account, recentPostCount: media.length } as unknown as Json,
      });
      results.instagram = "captured";
    } catch (err) {
      logger.error("instagram snapshot capture failed", { error: err instanceof Error ? err.message : String(err) });
      results.instagram = "failed";
    }
  } else {
    results.instagram = "not_configured";
  }

  if (isTikTokConfigured()) {
    try {
      const account = await getTikTokAccountSnapshot();
      await supabase.from("social_account_snapshots").insert({
        platform: "tiktok",
        followers_count: account.followersCount,
        impressions: account.videoViews,
        likes: account.likes,
        comments: account.comments,
        shares: account.shares,
        raw_data: { account } as unknown as Json,
      });
      results.tiktok = "captured";
    } catch (err) {
      logger.error("tiktok snapshot capture failed", { error: err instanceof Error ? err.message : String(err) });
      results.tiktok = "failed";
    }
  } else {
    results.tiktok = "not_configured";
  }

  return NextResponse.json({ status: "done", results });
}
