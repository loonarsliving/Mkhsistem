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
import { isZernioConfigured, listZernioAccounts, getZernioAccountSnapshot, getRecentZernioMediaPerformance, type ZernioProduct } from "@/lib/social/zernio";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Shared by both the Zernio and direct-Graph-API Instagram paths -- same insert shape either way, only where account/media came from differs. */
async function insertInstagramSnapshot(
  supabase: AdminClient,
  productLine: ZernioProduct,
  account: InstagramAccountSnapshot,
  media: InstagramMediaPerformance[],
  source: string,
) {
  const { bestHour, topContentType } = summarizeBestPostingPattern(media);
  const totals = media.reduce(
    (acc, m) => ({ likes: acc.likes + m.likes, comments: acc.comments + m.comments, shares: acc.shares + m.shares, saves: acc.saves + m.saves }),
    { likes: 0, comments: 0, shares: 0, saves: 0 },
  );

  await supabase.from("social_account_snapshots").insert({
    platform: "instagram",
    product_line: productLine,
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
 * Captures both platforms for ONE product line. Property tries Zernio
 * first, then falls back to the direct Meta/TikTok API (its original
 * pre-Zernio integration) -- Beauty is Zernio-only, it never had a direct
 * API integration to fall back to (0126).
 */
async function captureForProduct(supabase: AdminClient, product: ZernioProduct): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const zernioReady = isZernioConfigured(product);

  const zernioInstagramAccount = zernioReady ? (await listZernioAccounts("instagram", product).catch(() => []))[0] : undefined;
  if (zernioInstagramAccount) {
    try {
      const [account, media] = await Promise.all([
        getZernioAccountSnapshot(zernioInstagramAccount.id, "instagram", product),
        getRecentZernioMediaPerformance(zernioInstagramAccount.id, "instagram", 12, product),
      ]);
      await insertInstagramSnapshot(supabase, product, account, media, "zernio");
      results.instagram = "captured_via_zernio";
    } catch (err) {
      logger.error("instagram snapshot capture failed (zernio)", { product, error: err instanceof Error ? err.message : String(err) });
      results.instagram = "failed";
    }
  } else if (product === "property" && isInstagramConfigured()) {
    try {
      const [account, media] = await Promise.all([getInstagramAccountSnapshot(), getRecentInstagramMediaPerformance(12)]);
      await insertInstagramSnapshot(supabase, product, account, media, "meta_graph_api");
      results.instagram = "captured";
    } catch (err) {
      logger.error("instagram snapshot capture failed", { error: err instanceof Error ? err.message : String(err) });
      results.instagram = "failed";
    }
  } else {
    results.instagram = "not_configured";
  }

  const zernioTikTokAccount = zernioReady ? (await listZernioAccounts("tiktok", product).catch(() => []))[0] : undefined;
  if (zernioTikTokAccount) {
    try {
      const account = await getZernioAccountSnapshot(zernioTikTokAccount.id, "tiktok", product);
      await supabase.from("social_account_snapshots").insert({
        platform: "tiktok",
        product_line: product,
        followers_count: account.followersCount,
        impressions: account.profileViews,
        raw_data: { account, source: "zernio" } as unknown as Json,
      });
      results.tiktok = "captured_via_zernio";
    } catch (err) {
      logger.error("tiktok snapshot capture failed (zernio)", { product, error: err instanceof Error ? err.message : String(err) });
      results.tiktok = "failed";
    }
  } else if (product === "property" && isTikTokConfigured()) {
    try {
      const account = await getTikTokAccountSnapshot();
      await supabase.from("social_account_snapshots").insert({
        platform: "tiktok",
        product_line: product,
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

  return results;
}

/**
 * Daily own-account performance capture -- triggered by pg_cron via
 * net.http_post (social_run_daily_snapshot_capture, migration 0086), same
 * pattern as /api/ai/whatsapp-relay. Runs for both product lines (property,
 * beauty -- 0126), each fully independent so a failure on one never blocks
 * the other. impressions doubles as "profile views" for Instagram rows and
 * "video views" for TikTok rows -- see lib/ai/domains/markom.ts's
 * gatherContentPlannerContext/processSocialWeeklyEvaluation, which read it
 * back the same way.
 *
 * property and beauty MUST run sequentially, not via Promise.all -- see
 * lib/social/zernio.ts's module doc for why running two products'
 * Zernio calls concurrently corrupts both with cross-authenticated data.
 */
export async function POST() {
  const supabase = createAdminClient();
  const property = await captureForProduct(supabase, "property");
  const beauty = await captureForProduct(supabase, "beauty");
  return NextResponse.json({ status: "done", results: { property, beauty } });
}
