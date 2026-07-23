import "server-only";

/**
 * TikTok for Business API config -- entirely separate credentials from
 * Meta (own developer app registration at business-api.tiktok.com). Not
 * set up yet as of this module's creation; every function here fails
 * closed with a clear "not configured" until real credentials exist,
 * mirroring lib/meta/config.ts's isMetaConfigured() pattern.
 */
export const TIKTOK_CONFIG = {
  clientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
  clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
  accessToken: process.env.TIKTOK_ACCESS_TOKEN ?? "",
  advertiserId: process.env.TIKTOK_ADVERTISER_ID ?? "",
  apiVersion: process.env.TIKTOK_API_VERSION ?? "v1.3",
} as const;

export function isTikTokConfigured(): boolean {
  return TIKTOK_CONFIG.accessToken.length > 0 && TIKTOK_CONFIG.advertiserId.length > 0;
}
