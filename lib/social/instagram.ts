import "server-only";

import { META_CONFIG } from "@/lib/meta/config";
import { metaGraphRequest } from "@/lib/meta/client";

/**
 * Instagram Graph API client -- reuses the same Meta app/token as the Ads
 * Specialist module (lib/meta/client.ts, lib/meta/config.ts), since
 * Instagram Business accounts live in the same Graph API surface. The
 * token needs instagram_basic + instagram_manage_insights scopes in
 * addition to whatever ads_management already granted it -- see the
 * connection health card for whether that's actually true for the current
 * token.
 *
 * Caveat: Meta has changed Instagram insights metric names across API
 * versions more than once (e.g. impressions deprecated for many account
 * types in favor of a unified "views" metric), and valid metrics differ by
 * media_product_type (REELS vs FEED vs CAROUSEL_ALBUM). This has not been
 * exercised against a real connected account yet -- if a metric name below
 * gets rejected once Instagram is actually connected, that's expected
 * first-run friction, not a design error; fix the metric string based on
 * the real error the same way the Ads module's model/parameter names were
 * fixed earlier by reading actual API responses, not by guessing.
 */

export function isInstagramConfigured(): boolean {
  return META_CONFIG.accessToken.length > 0 && META_CONFIG.igUserId.length > 0;
}

interface InsightsResponse {
  data: { name: string; values: { value: number }[] }[];
}

function metricValue(insights: InsightsResponse, name: string): number {
  return insights.data?.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
}

export interface InstagramAccountSnapshot {
  followersCount: number;
  reach: number;
  profileViews: number;
}

/** Account-level performance -- the "Analisis Akun Perusahaan" reach/views numbers, a plain API read. */
export async function getInstagramAccountSnapshot(): Promise<InstagramAccountSnapshot> {
  const [account, insights] = await Promise.all([
    metaGraphRequest<{ followers_count?: number }>(`/${META_CONFIG.igUserId}`, { fields: "followers_count" }),
    metaGraphRequest<InsightsResponse>(`/${META_CONFIG.igUserId}/insights`, { metric: "reach,profile_views", period: "day" }),
  ]);

  return {
    followersCount: account.followers_count ?? 0,
    reach: metricValue(insights, "reach"),
    profileViews: metricValue(insights, "profile_views"),
  };
}

export interface InstagramMediaPerformance {
  id: string;
  permalink: string | null;
  caption: string | null;
  mediaType: string;
  timestamp: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

/**
 * Recent posts + their per-post performance -- the real data behind "jam
 * upload terbaik" and "jenis konten yang paling berhasil" (both computed
 * as plain aggregation over this, no AI needed for the numbers
 * themselves), and fed as context into the AI checklist/evaluation
 * prompts. One post's insights failing (a metric unsupported for its
 * media type) is caught per-post so it doesn't drop the whole batch.
 */
export async function getRecentInstagramMediaPerformance(limit = 12): Promise<InstagramMediaPerformance[]> {
  const media = await metaGraphRequest<{
    data: { id: string; media_type: string; media_product_type?: string; timestamp: string; permalink?: string; caption?: string }[];
  }>(`/${META_CONFIG.igUserId}/media`, { fields: "id,media_type,media_product_type,timestamp,permalink,caption", limit });

  const results: InstagramMediaPerformance[] = [];
  for (const item of media.data ?? []) {
    try {
      const insights = await metaGraphRequest<InsightsResponse>(`/${item.id}/insights`, { metric: "reach,likes,comments,shares,saved" });
      results.push({
        id: item.id,
        permalink: item.permalink ?? null,
        caption: item.caption ?? null,
        mediaType: item.media_product_type ?? item.media_type,
        timestamp: item.timestamp,
        reach: metricValue(insights, "reach"),
        likes: metricValue(insights, "likes"),
        comments: metricValue(insights, "comments"),
        shares: metricValue(insights, "shares"),
        saves: metricValue(insights, "saved"),
      });
    } catch {
      // Skip this post rather than failing the whole batch -- see module doc comment.
    }
  }
  return results;
}

/** Pure aggregation over real fetched posts -- which hour of day and which content type have the best average reach. No AI needed for this, it's arithmetic over real numbers. */
export function summarizeBestPostingPattern(posts: InstagramMediaPerformance[]): { bestHour: number | null; topContentType: string | null } {
  if (posts.length === 0) return { bestHour: null, topContentType: null };

  const reachByHour = new Map<number, { total: number; count: number }>();
  const reachByType = new Map<string, { total: number; count: number }>();

  for (const post of posts) {
    const hour = new Date(post.timestamp).getHours();
    const hourStats = reachByHour.get(hour) ?? { total: 0, count: 0 };
    hourStats.total += post.reach;
    hourStats.count += 1;
    reachByHour.set(hour, hourStats);

    const typeStats = reachByType.get(post.mediaType) ?? { total: 0, count: 0 };
    typeStats.total += post.reach;
    typeStats.count += 1;
    reachByType.set(post.mediaType, typeStats);
  }

  const bestHour = [...reachByHour.entries()].sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count)[0]?.[0] ?? null;
  const topContentType = [...reachByType.entries()].sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count)[0]?.[0] ?? null;

  return { bestHour, topContentType };
}

/**
 * Content Publishing API -- creates a media container from a public
 * image/video URL (always a real file Markom uploaded to
 * markom-content-submissions, never AI-generated). REELS requires an extra
 * async processing step (see getContainerStatus) before it can be
 * published; images are typically ready right away but are still checked
 * the same way for consistency and because Meta's own docs recommend it.
 *
 * IMPORTANT CAVEAT (unverified against a real token): the module doc
 * comment above notes the connected token was requested with only
 * instagram_basic + instagram_manage_insights (read-only) scopes.
 * Publishing needs instagram_content_publish in addition -- if that scope
 * was never granted, every call here will fail with a permission error the
 * same way the Ads module's Page-permission error did, and the fix is the
 * same: grant the scope to the token in Meta Business Settings, not a code
 * change. Don't assume this works until a real publish attempt succeeds.
 */
export async function createInstagramMediaContainer(input: {
  mediaType: "IMAGE" | "REELS";
  mediaUrl: string;
  caption: string;
}): Promise<{ id: string }> {
  return metaGraphRequest<{ id: string }>(
    `/${META_CONFIG.igUserId}/media`,
    {
      ...(input.mediaType === "REELS" ? { media_type: "REELS", video_url: input.mediaUrl } : { image_url: input.mediaUrl }),
      caption: input.caption,
    },
    "POST",
  );
}

export type InstagramContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

/** Video/Reels containers process asynchronously on Meta's side -- must be FINISHED before media_publish will accept it. */
export async function getInstagramContainerStatus(containerId: string): Promise<InstagramContainerStatus> {
  const result = await metaGraphRequest<{ status_code?: string }>(`/${containerId}`, { fields: "status_code" });
  return (result.status_code as InstagramContainerStatus) ?? "ERROR";
}

/** Publishes a FINISHED container -- calling this on a container that isn't ready yet is rejected by Meta, so callers must check getInstagramContainerStatus first. */
export async function publishInstagramContainer(containerId: string): Promise<{ id: string }> {
  return metaGraphRequest<{ id: string }>(`/${META_CONFIG.igUserId}/media_publish`, { creation_id: containerId }, "POST");
}
