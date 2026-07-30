import "server-only";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

import { secretsMatch } from "./cron-auth";

/**
 * Shared-secret guard for the file hub bridge endpoints — the routes only
 * the filehub-loonars Vercel deployment (filemanager.haluoleo.id) is ever
 * supposed to call, starting with /api/integrations/whatsapp/bridge-send
 * (the Villa app's outbound WhatsApp path: villa-api → file hub → here →
 * Whacenter).
 *
 * Unlike requireCronAuth this is FAIL-CLOSED on an unset secret: cron-auth
 * had to protect endpoints that were already live and open, so it rolled
 * out without an outage window. The bridge endpoints ship new, have zero
 * existing callers, and send WhatsApp messages on the company's Whacenter
 * device — there is no version of "temporarily open" that is acceptable, so
 * an unset FILEHUB_BRIDGE_SECRET means the bridge simply isn't commissioned
 * yet (503, mirroring the file hub's own fail-closed endpoints).
 */
export function requireFilehubBridgeAuth(request: Request): NextResponse | null {
  const expected = (process.env.FILEHUB_BRIDGE_SECRET ?? "").trim();
  const path = new URL(request.url).pathname;

  if (expected.length === 0) {
    logger.warn("bridge auth: FILEHUB_BRIDGE_SECRET is not set, rejecting request", { path });
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-bridge-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    logger.warn("bridge auth: rejected request with missing or invalid x-bridge-secret", { path });
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  return null;
}
