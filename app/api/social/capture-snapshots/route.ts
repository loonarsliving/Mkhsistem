import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isInstagramConfigured,
  getInstagramAccountSnapshot,
  getRecentInstagramMediaPerformance,
  summarizeBestPostingPattern,
  type InstagramAccountSnapshot,
  type InstagramMediaPerformance,
} from "@/lib/social/instagram";
import { getTikTokAccountSnapshot } from "@/lib/social/tiktok";
import { isTikTokConfigured } from "@/lib/social/tiktok-config";
import { isZernioConfigured, listZernioAccounts, getZernioAccountSnapshot, getRecentZernioMediaPerformance } from "@/lib/social/zernio";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Shared by both the Zernio and direct-Graph-API Instagram paths -- same insert shape either way, only where account/media came from differs. */
async function insertInstagramSnapshot(supabase: AdminClient, account: InstagramAccountSnapshot, media: InstagramMediaPerformance[], source: string) {
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
    raw_data: { account, recentPostCount: media.length, source } as unknown as Json,
  });
}

/**
 * Daily own-account performance capture -- triggered by pg_cron via
 * net.http_post (social_run_daily_snapshot_capture, migration 0086), same
 * pattern as /api/ai/whatsapp-relay. Each platform is captured
 * independently and a failure on one never blocks the other. impressions
 * doubles as "profile views" for Instagram rows and "video views" for
 * TikTok rows -- see lib/ai/domains/markom.ts's
 * gatherContentPlannerContext/processSocialWeeklyEvaluation, which read it
 * back the same way.
 *
 * Zernio (lib/social/zernio.ts) is preferred over the direct Meta/TikTok
 * Graph API when configured AND an account is actually connected there --
 * Meta's own Business Verification requirement blocked the direct path
 * (see lib/social/instagram.ts's module doc). Falls back to the direct
 * API path if Zernio isn't connected for that platform yet, so nothing
 * regresses for whichever path happens to be working.
 */
export async function POST() {
  const supabase = createAdminClient();
  const results: Record<string, string> = {};
  const zernioReady = isZernioConfigured();

  const zernioInstagramAccount = zernioReady ? (await listZernioAccounts("instagram").catch(() => []))[0] : undefined;
  if (zernioInstagramAccount) {
    try {
      const [account, media] = await Promise.all([
        getZernioAccountSnapshot(zernioInstagramAccount.id, "instagram"),
        getRecentZernioMediaPerformance(zernioInstagramAccount.id, "instagram", 12),
      ]);
      await insertInstagramSnapshot(supabase, account, media, "zernio");
      results.instagram = "captured_via_zernio";
    } catch (err) {
      logger.error("instagram snapshot capture failed (zernio)", { error: err instanceof Error ? err.message : String(err) });
      results.instagram = "failed";
    }
  } else if (isInstagramConfigured()) {
    try {
      const [account, media] = await Promise.all([getInstagramAccountSnapshot(), getRecentInstagramMediaPerformance(12)]);
      await insertInstagramSnapshot(supabase, account, media, "meta_graph_api");
      results.instagram = "captured";
    } catch (err) {
      logger.error("instagram snapshot capture failed", { error: err instanceof Error ? err.message : String(err) });
      results.instagram = "failed";
    }
  } else {
    results.instagram = "not_configured";
  }

  const zernioTikTokAccount = zernioReady ? (await listZernioAccounts("tiktok").catch(() => []))[0] : undefined;
  if (zernioTikTokAccount) {
    try {
      const account = await getZernioAccountSnapshot(zernioTikTokAccount.id, "tiktok");
      await supabase.from("social_account_snapshots").insert({
        platform: "tiktok",
        followers_count: account.followersCount,
        impressions: account.profileViews,
        raw_data: { account, source: "zernio" } as unknown as Json,
      });
      results.tiktok = "captured_via_zernio";
    } catch (err) {
      logger.error("tiktok snapshot capture failed (zernio)", { error: err instanceof Error ? err.message : String(err) });
      results.tiktok = "failed";
    }
  } else if (isTikTokConfigured()) {
    try {
      const account = await getTikTokAccountSnapshot();
      await supabase.from("social_account_snapshots").insert({
        platform: "tiktok",
        followers_count: account.followersCount,
        impressions: account.videoViews,
        likes: account.likes,
        comments: account.comments,
        shares: account.shares,
        raw_data: { account, source: "tiktok_api" } as unknown as Json,
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
