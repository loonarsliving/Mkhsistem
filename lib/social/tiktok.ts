import "server-only";

import { TIKTOK_CONFIG, isTikTokConfigured } from "./tiktok-config";

const TIKTOK_BASE = "https://business-api.tiktok.com/open_api";

export class TikTokApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TikTokApiError";
  }
}

/**
 * Thin TikTok for Business API wrapper -- auth is a custom `Access-Token`
 * header (not Authorization: Bearer, unlike Meta). Untested against a real
 * account as of writing (no TIKTOK_* credentials exist yet) -- endpoint
 * paths and response shapes below are TikTok's documented v1.3 Business
 * API surface, but exact field names may need correcting once this runs
 * against a real token, the same way Meta's model/parameter names needed
 * fixing earlier by reading actual API error responses rather than
 * guessing further.
 */
async function tiktokRequest<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!isTikTokConfigured()) {
    throw new TikTokApiError("TikTok integration is not configured (TIKTOK_ACCESS_TOKEN/TIKTOK_ADVERTISER_ID)", 0);
  }

  const url = new URL(`${TIKTOK_BASE}/${TIKTOK_CONFIG.apiVersion}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  const response = await fetch(url.toString(), { headers: { "Access-Token": TIKTOK_CONFIG.accessToken } });
  const json = (await response.json().catch(() => null)) as { code?: number; message?: string; data?: T } | null;

  if (!response.ok || json?.code !== 0) {
    throw new TikTokApiError(`TikTok API error: ${json?.message ?? `HTTP ${response.status}`}`, response.status);
  }
  return json.data as T;
}

interface CachedTikTokHealthCheck {
  result: { ok: boolean; detail: string };
  cachedAt: number;
}
let cachedTikTokHealthCheck: CachedTikTokHealthCheck | null = null;
const TIKTOK_HEALTHCHECK_CACHE_MS = 300_000;

export async function tiktokHealthCheck(): Promise<{ ok: boolean; detail: string; configured: boolean }> {
  if (!isTikTokConfigured()) {
    const missing = [
      TIKTOK_CONFIG.accessToken.length === 0 && "TIKTOK_ACCESS_TOKEN",
      TIKTOK_CONFIG.advertiserId.length === 0 && "TIKTOK_ADVERTISER_ID",
    ].filter((v): v is string => Boolean(v));
    return { ok: false, detail: `Belum diatur: ${missing.join(", ")}`, configured: false };
  }

  if (cachedTikTokHealthCheck && Date.now() - cachedTikTokHealthCheck.cachedAt < TIKTOK_HEALTHCHECK_CACHE_MS) {
    return { ...cachedTikTokHealthCheck.result, detail: `${cachedTikTokHealthCheck.result.detail} (cached)`, configured: true };
  }

  try {
    const info = await tiktokRequest<{ list: { advertiser_id: string; advertiser_name: string }[] }>("/advertiser/info/", {
      advertiser_ids: JSON.stringify([TIKTOK_CONFIG.advertiserId]),
    });
    const advertiser = info.list?.[0];
    const result = { ok: Boolean(advertiser), detail: advertiser ? `Terhubung ke akun "${advertiser.advertiser_name}"` : "Advertiser ID tidak ditemukan" };
    if (result.ok) cachedTikTokHealthCheck = { result, cachedAt: Date.now() };
    return { ...result, configured: true };
  } catch (err) {
    const detail = err instanceof TikTokApiError ? err.message : "Gagal terhubung ke TikTok Business API";
    return { ok: false, detail, configured: true };
  }
}

export interface TikTokAccountSnapshot {
  followersCount: number;
  videoViews: number;
  likes: number;
  comments: number;
  shares: number;
}

/** Own-account performance -- placeholder shape until real credentials let this be verified against TikTok's actual Business Account Insights response. */
export async function getTikTokAccountSnapshot(): Promise<TikTokAccountSnapshot> {
  const data = await tiktokRequest<{
    follower_count?: number;
    video_views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  }>("/business/get/", { business_id: TIKTOK_CONFIG.advertiserId, fields: JSON.stringify(["follower_count", "video_views", "likes", "comments", "shares"]) });

  return {
    followersCount: data.follower_count ?? 0,
    videoViews: data.video_views ?? 0,
    likes: data.likes ?? 0,
    comments: data.comments ?? 0,
    shares: data.shares ?? 0,
  };
}
