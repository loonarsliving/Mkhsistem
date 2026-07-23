import { NextResponse, type NextRequest } from "next/server";

import { getZernioConnectUrl, isZernioConfigured, listZernioAccounts, type ZernioProduct } from "@/lib/social/zernio";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY setup helper -- one-time step to connect Instagram/TikTok via
 * Zernio (see lib/social/zernio.ts's module doc for why: Meta Business
 * Verification blocked the direct Graph API path). Returns a real OAuth
 * URL per platform for an operator to open in a browser and log into
 * their actual Instagram/TikTok account -- ordinary login, no Business
 * Verification. Also reports which accounts are already connected, so
 * this doubles as a status check. ?product=beauty checks/connects the
 * separate Loonars Beauty Zernio account (0126) instead of property's.
 * Remove once both product lines show both platforms connected here and
 * capture-snapshots has confirmed real data flowing for each.
 */
export async function GET(request: NextRequest) {
  const productParam = request.nextUrl.searchParams.get("product");
  const product: ZernioProduct = productParam === "beauty" ? "beauty" : "property";

  const result: Record<string, unknown> = { product, zernioConfigured: isZernioConfigured(product) };
  if (!isZernioConfigured(product)) {
    result.error = product === "beauty" ? "ZERNIO_BEAUTY_API_KEY not set" : "ZERNIO_API_KEY not set";
    return NextResponse.json(result);
  }

  try {
    result.connectedInstagram = await listZernioAccounts("instagram", product);
    result.connectedTikTok = await listZernioAccounts("tiktok", product);
  } catch (err) {
    result.listAccountsError = err instanceof Error ? err.message : String(err);
  }

  try {
    result.instagramConnectUrl = await getZernioConnectUrl("instagram", undefined, product);
  } catch (err) {
    result.instagramConnectUrlError = err instanceof Error ? err.message : String(err);
  }

  try {
    result.tiktokConnectUrl = await getZernioConnectUrl("tiktok", undefined, product);
  } catch (err) {
    result.tiktokConnectUrlError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result);
}
