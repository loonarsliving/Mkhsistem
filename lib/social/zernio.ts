import "server-only";

import { Zernio } from "@zernio/node";
import type { AccountWithFollowerStats, AnalyticsListResponse, SocialAccount } from "@zernio/node";

type AnalyticsPost = NonNullable<AnalyticsListResponse["posts"]>[number];

/**
 * Zernio (zernio.com) -- unified social API used as the Instagram/TikTok
 * data source Meta's Business Verification blocked us from getting
 * directly (see lib/social/instagram.ts's module doc for that history).
 * Zernio holds its own verified Meta/TikTok apps; connecting an account is
 * a plain OAuth login (getZernioConnectUrl), no Business Verification
 * paperwork on our side.
 *
 * Two separate Zernio ACCOUNTS/API keys, one per product line (0126) --
 * Zernio's free tier caps at 2 connected accounts, and property already
 * uses both (Instagram + TikTok) for its own account. Loonars Beauty gets
 * its own Zernio account (ZERNIO_BEAUTY_API_KEY) so it stays on the free
 * tier too, instead of competing for property's 2-account allowance. Every
 * exported function takes an optional `product` param (default
 * "property") that picks which client/API key to use -- existing property
 * call sites are unaffected, beauty call sites pass "beauty" explicitly.
 *
 * Return shapes deliberately mirror lib/social/instagram.ts's
 * InstagramAccountSnapshot/InstagramMediaPerformance so
 * app/api/social/capture-snapshots/route.ts can swap data sources with a
 * minimal diff. Built from the official @zernio/node SDK's real shipped
 * TypeScript types (node_modules/@zernio/node/dist/index.d.ts) -- not
 * guessed.
 */

export type ZernioProduct = "property" | "beauty";

const ZERNIO_ENV_VAR: Record<ZernioProduct, string> = {
  property: "ZERNIO_API_KEY",
  beauty: "ZERNIO_BEAUTY_API_KEY",
};

const cachedClients = new Map<ZernioProduct, Zernio>();

function getClient(product: ZernioProduct): Zernio {
  let client = cachedClients.get(product);
  if (!client) {
    client = new Zernio({ apiKey: process.env[ZERNIO_ENV_VAR[product]] });
    cachedClients.set(product, client);
  }
  return client;
}

export function isZernioConfigured(product: ZernioProduct = "property"): boolean {
  return (process.env[ZERNIO_ENV_VAR[product]] ?? "").length > 0;
}

export type ZernioPlatform = "instagram" | "tiktok";

export interface ZernioAccountRef {
  id: string;
  platform: string;
  username: string | null;
}

/** Accounts actually connected (completed OAuth) on this Zernio profile -- empty for a platform nobody has connected yet via getZernioConnectUrl. */
export async function listZernioAccounts(platform?: ZernioPlatform, product: ZernioProduct = "property"): Promise<ZernioAccountRef[]> {
  const client = getClient(product);
  const result = await client.accounts.listAccounts({ query: { platform, status: "connected" } });
  const accounts: SocialAccount[] = result.data?.accounts ?? [];
  return accounts.map((a) => ({ id: a._id, platform: a.platform, username: a.username ?? a.displayName ?? null }));
}

/** Ensures a Zernio "profile" (their term for a workspace accounts are grouped under) exists -- creates one on first use. Required before getZernioConnectUrl can be called. */
export async function ensureDefaultZernioProfile(product: ZernioProduct = "property"): Promise<string> {
  const client = getClient(product);
  const list = await client.profiles.listProfiles();
  const existing = list.data?.profiles?.[0]?._id;
  if (existing) return existing;

  const created = await client.profiles.createProfile({ body: { name: product === "beauty" ? "Loonars Beauty" : "PT Maha Karya Haluoleo" } });
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
export async function getZernioConnectUrl(platform: ZernioPlatform, redirectUrl?: string, product: ZernioProduct = "property"): Promise<string> {
  const profileId = await ensureDefaultZernioProfile(product);
  const client = getClient(product);
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
 *
 * Two field-mapping bugs fixed here, found by dumping the raw Zernio
 * response (both were silently returning 0, no error thrown):
 * 1. getFollowerStats' accounts[] carries the real count under
 *    `currentFollowers`, not `followersCount` -- that field only exists on
 *    the analytics endpoint's accounts[] (a different, unrelated array).
 * 2. TikTok's platform API doesn't report impressions/reach at all (Zernio
 *    always returns 0 for both there) -- `views` is the only real volume
 *    metric it exposes, so use that for TikTok's profile-views figure.
 */
export async function getZernioAccountSnapshot(accountId: string, platform: ZernioPlatform, product: ZernioProduct = "property"): Promise<ZernioAccountSnapshot> {
  const client = getClient(product);
  const [followerStats, analytics] = await Promise.all([
    client.accounts.getFollowerStats({ query: { accountIds: accountId } }),
    client.analytics.getAnalytics({ query: { accountId, platform, source: "all", sortBy: "date", order: "desc", limit: 30 } }),
  ]);

  const account = followerStats.data?.accounts?.find((a: AccountWithFollowerStats) => a._id === accountId);
  const posts: AnalyticsPost[] = (analytics.data && "posts" in analytics.data ? analytics.data.posts : []) ?? [];
  const reach = posts.reduce((sum: number, p: AnalyticsPost) => sum + (p.analytics?.reach ?? 0), 0);
  const profileViews = posts.reduce(
    (sum: number, p: AnalyticsPost) => sum + (platform === "tiktok" ? (p.analytics?.views ?? 0) : (p.analytics?.impressions ?? 0)),
    0,
  );

  return {
    followersCount: account?.currentFollowers ?? 0,
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
export async function getRecentZernioMediaPerformance(
  accountId: string,
  platform: ZernioPlatform,
  limit = 12,
  product: ZernioProduct = "property",
): Promise<ZernioMediaPerformance[]> {
  const client = getClient(product);
  const result = await client.analytics.getAnalytics({ query: { accountId, platform, source: "all", sortBy: "date", order: "desc", limit } });
  const posts: AnalyticsPost[] = (result.data && "posts" in result.data ? result.data.posts : []) ?? [];

  return posts.map((post: AnalyticsPost) => ({
    id: post._id ?? post.latePostId ?? "",
    permalink: post.platformPostUrl ?? null,
    caption: post.content ?? null,
    mediaType: post.mediaType ?? "unknown",
    timestamp: post.publishedAt ?? post.scheduledFor ?? new Date().toISOString(),
    // TikTok never populates reach (see getZernioAccountSnapshot's doc) -- views is
    // the real volume metric there, used as the reach proxy.
    reach: platform === "tiktok" ? (post.analytics?.views ?? 0) : (post.analytics?.reach ?? 0),
    likes: post.analytics?.likes ?? 0,
    comments: post.analytics?.comments ?? 0,
    shares: post.analytics?.shares ?? 0,
    saves: post.analytics?.saves ?? 0,
  }));
}
