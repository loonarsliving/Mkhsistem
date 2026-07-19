import { NextResponse } from "next/server";

import { getZernioConnectUrl, isZernioConfigured, listZernioAccounts } from "@/lib/social/zernio";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY setup helper -- one-time step to connect Instagram/TikTok via
 * Zernio (see lib/social/zernio.ts's module doc for why: Meta Business
 * Verification blocked the direct Graph API path). Returns a real OAuth
 * URL per platform for an operator to open in a browser and log into
 * their actual Instagram/TikTok account -- ordinary login, no Business
 * Verification. Also reports which accounts are already connected, so
 * this doubles as a status check. Remove once both platforms show
 * connected here and capture-snapshots has confirmed real data flowing.
 */
export async function GET() {
  const result: Record<string, unknown> = { zernioConfigured: isZernioConfigured() };
  if (!isZernioConfigured()) {
    result.error = "ZERNIO_API_KEY not set";
    return NextResponse.json(result);
  }

  try {
    result.connectedInstagram = await listZernioAccounts("instagram");
    result.connectedTikTok = await listZernioAccounts("tiktok");
  } catch (err) {
    result.listAccountsError = err instanceof Error ? err.message : String(err);
  }

  try {
    result.instagramConnectUrl = await getZernioConnectUrl("instagram");
  } catch (err) {
    result.instagramConnectUrlError = err instanceof Error ? err.message : String(err);
  }

  try {
    result.tiktokConnectUrl = await getZernioConnectUrl("tiktok");
  } catch (err) {
    result.tiktokConnectUrlError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result);
}
