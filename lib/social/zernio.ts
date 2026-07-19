import "server-only";

import { Zernio } from "@zernio/node";
import type { AnalyticsListResponse, SocialAccount } from "@zernio/node";

type AnalyticsPost = NonNullable<AnalyticsListResponse["posts"]>[number];

/**
 * Zernio (zernio.com) -- unified social API used as the Instagram/TikTok
 * data source Meta's Business Verification blocked us from getting
 * directly (see lib/social/instagram.ts's module doc for that history).
 * Zernio holds its own verified Meta/TikTok apps; connecting an account is
 * a plain OAuth login (getZernioConnectUrl), no Business Verification
 * paperwork on our side.
 *
 * Return shapes deliberately mirror lib/social/instagram.ts's
 * InstagramAccountSnapshot/InstagramMediaPerformance so
 * app/api/social/capture-snapshots/route.ts can swap data sources with a
 * minimal diff. Built from the official @zernio/node SDK's real shipped
 * TypeScript types (node_modules/@zernio/node/dist/index.d.ts) -- not
 * guessed -- but never yet exercised against a live account (no
 * ZERNIO_API_KEY configured at the time this was written). If a field
 * comes back differently than expected once real data flows, fix the
 * mapping based on the actual response the same way every other
 * first-connection issue in this codebase has been fixed, not by
 * re-guessing.
 */

let cachedClient: Zernio | null = null;

function getClient(): Zernio {
  if (!cachedClient) {
    cachedClient = new Zernio({ apiKey: process.env.ZERNIO_API_KEY });
  }
  return cachedClient;
}

export function isZernioConfigured(): boolean {
  return (process.env.ZERNIO_API_KEY ?? "").length > 0;
}

export type ZernioPlatform = "instagram" | "tiktok";

export interface ZernioAccountRef {
  id: string;
  platform: string;
  username: string | null;
}

/** Accounts actually connected (completed OAuth) on this Zernio profile -- empty for a platform nobody has connected yet via getZernioConnectUrl. */
export async function listZernioAccounts(platform?: ZernioPlatform): Promise<ZernioAccountRef[]> {
  const client = getClient();
  const result = await client.accounts.listAccounts({ query: { platform, status: "connected" } });
  const accounts: SocialAccount[] = result.data?.accounts ?? [];
  return accounts.map((a) => ({ id: a._id, platform: a.platform, username: a.username ?? a.displayName ?? null }));
}

/** Ensures a Zernio "profile" (their term for a workspace accounts are grouped under) exists -- creates one on first use. Required before getZernioConnectUrl can be called. */
export async function ensureDefaultZernioProfile(): Promise<string> {
  const client = getClient();
  const list = await client.profiles.listProfiles();
  const existing = list.data?.profiles?.[0]?._id;
  if (existing) return existing;

  const created = await client.profiles.createProfile({ body: { name: "PT Maha Karya Haluoleo" } });
  const id = created.data?.profile?._id;
  if (!id) throw new Error("Zernio did not return a profile id when creating the default profile");
  return id;
}

/**
 * One-time setup step: the URL an operator opens in a real browser, logs
 * into their actual Instagram/TikTok account, and authorizes Zernio to
 * read it -- ordinary OAuth, no Meta Business Verification on our side.
 * Call once per platform; the resulting connection persists on Zernio's
 * side until revoked.
 */
export async function getZernioConnectUrl(platform: ZernioPlatform, redirectUrl?: string): Promise<string> {
  const profileId = await ensureDefaultZernioProfile();
  const client = getClient();
  const result = await client.connect.getConnectUrl({ path: { platform }, query: { profileId, redirect_url: redirectUrl } });
  const authUrl = result.data?.authUrl;
  if (!authUrl) throw new Error(`Zernio did not return a connect URL for ${platform}`);
  return authUrl;
}

export interface ZernioAccountSnapshot {
  followersCount: number;
  reach: number;
  profileViews: number;
}

/**
 * Account-level snapshot, same shape as InstagramAccountSnapshot so
 * capture-snapshots can call this instead when Zernio is the configured
 * source. reach/profileViews are summed across the last 30 real posts
 * (Zernio's follower-stats endpoint doesn't separately expose a Meta-style
 * "profile views" aggregate) -- profileViews here is really summed post
 * impressions, an approximation, not a literal profile-view count.
 */
export async function getZernioAccountSnapshot(accountId: string, platform: ZernioPlatform): Promise<ZernioAccountSnapshot> {
  const client = getClient();
  const [followerStats, analytics] = await Promise.all([
    client.accounts.getFollowerStats({ query: { accountIds: accountId } }),
    client.analytics.getAnalytics({ query: { accountId, platform, source: "all", sortBy: "date", order: "desc", limit: 30 } }),
  ]);

  const account = followerStats.data?.accounts?.find((a: SocialAccount) => a._id === accountId);
  const posts: AnalyticsPost[] = (analytics.data && "posts" in analytics.data ? analytics.data.posts : []) ?? [];
  const reach = posts.reduce((sum: number, p: AnalyticsPost) => sum + (p.analytics?.reach ?? 0), 0);
  const profileViews = posts.reduce((sum: number, p: AnalyticsPost) => sum + (p.analytics?.impressions ?? 0), 0);

  return {
    followersCount: account?.followersCount ?? 0,
    reach,
    profileViews,
  };
}

export interface ZernioMediaPerformance {
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
 * Recent posts + performance, same shape as InstagramMediaPerformance.
 * source: "all" covers both posts published via Zernio's own scheduler
 * and posts synced from the platform itself (source: "external") -- since
 * this account has only ever posted natively (never through Zernio), in
 * practice every result here is an "external" post, which is exactly what
 * we need real performance data for.
 */
export async function getRecentZernioMediaPerformance(accountId: string, platform: ZernioPlatform, limit = 12): Promise<ZernioMediaPerformance[]> {
  const client = getClient();
  const result = await client.analytics.getAnalytics({ query: { accountId, platform, source: "all", sortBy: "date", order: "desc", limit } });
  const posts: AnalyticsPost[] = (result.data && "posts" in result.data ? result.data.posts : []) ?? [];

  return posts.map((post: AnalyticsPost) => ({
    id: post._id ?? post.latePostId ?? "",
    permalink: post.platformPostUrl ?? null,
    caption: post.content ?? null,
    mediaType: post.mediaType ?? "unknown",
    timestamp: post.publishedAt ?? post.scheduledFor ?? new Date().toISOString(),
    reach: post.analytics?.reach ?? 0,
    likes: post.analytics?.likes ?? 0,
    comments: post.analytics?.comments ?? 0,
    shares: post.analytics?.shares ?? 0,
    saves: post.analytics?.saves ?? 0,
  }));
}
