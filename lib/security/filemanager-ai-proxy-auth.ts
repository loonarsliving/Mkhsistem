import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

/**
 * Shared-secret guard for /api/integrations/filemanager-ai-proxy — the
 * ONLY thing the standalone `Filemanager` repo (its own WhatsApp
 * connection, its own SQLite catalog, running on the owner's Mac Mini)
 * borrows from this app: a Gemini call, made through MK Connect's already
 * -configured GEMINI_API_KEY/circuit-breaker/retry stack instead of the
 * Mac Mini needing its own Gemini API key and resilience plumbing.
 * Filemanager holds no other access into this app -- no database access,
 * no WhatsApp send capability here, nothing.
 *
 * Fails CLOSED on an unset secret (same posture as cron-auth.ts's sibling
 * would suggest fail-open, but that pattern exists specifically to give a
 * zero-downtime rollout window for an endpoint that was already live and
 * unauthenticated -- this one is brand new, so there is no prior exposed
 * behavior to preserve, and an open Gemini proxy would let anyone who
 * finds the path spend this app's Gemini quota for free.
 */
export function requireFilemanagerAiProxyAuth(request: Request): NextResponse | null {
  const expected = (process.env.FILEMANAGER_AI_PROXY_SECRET ?? "").trim();
  const path = new URL(request.url).pathname;

  if (expected.length === 0) {
    logger.warn("filemanager AI proxy auth: FILEMANAGER_AI_PROXY_SECRET is not set, rejecting request", { path });
    return NextResponse.json({ status: "error", error: "filemanager AI proxy is not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-filemanager-ai-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`filemanager-ai-proxy-auth:${path}:${getClientIp(request)}`);
    if (limited) {
      logger.warn("filemanager AI proxy auth: rate-limited after repeated invalid x-filemanager-ai-secret attempts", { path });
      return NextResponse.json({ status: "error", error: "too many attempts" }, { status: 429 });
    }
    logger.warn("filemanager AI proxy auth: rejected request with missing or invalid x-filemanager-ai-secret", { path });
    return NextResponse.json({ status: "error", error: "unauthorized" }, { status: 401 });
  }

  return null;
}

/** Constant-time comparison — see cron-auth.ts's identical helper for why. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
