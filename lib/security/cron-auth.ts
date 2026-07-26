import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

/**
 * Shared secret guard for the endpoints that only pg_cron / Postgres
 * triggers are ever supposed to call.
 *
 * Why this exists: every automation endpoint in this app was reachable by
 * anyone on the internet who knew (or guessed) the path. Two of them --
 * /api/push/send and /api/ai/whatsapp-relay -- have a real mitigation of
 * their own (they re-fetch the row by UUID and only act on rows created in
 * the last 2 minutes, so a forged call can at most re-deliver a legitimate
 * notification to its rightful owner). The rest take no arguments at all:
 * POST {} to /api/crm/dispatch-promo-sends and it sends a WhatsApp batch,
 * to /api/social/publish-content and it publishes to Instagram/TikTok, to
 * /api/ai/voice-bridge/daily-digest and it burns Gemini tokens. The
 * careful anti-ban pacing those workers implement (BATCH_SIZE per 5-minute
 * tick) is only meaningful if the tick rate is actually controlled by
 * pg_cron -- an unauthenticated caller in a loop bypasses it entirely.
 *
 * Rollout is deliberately fail-open on an UNSET secret: until CRON_SECRET
 * exists in both Vercel and public.automation_config (see migration 0176),
 * requests are allowed exactly as before, so deploying this file changes
 * no behavior. Enforcement begins the moment the operator sets the env var
 * -- and because the database sends the header from the same migration,
 * both sides can be configured in either order without an outage window.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  // .trim() on both sides: pasting a secret into a dashboard env-var field
  // very easily carries a trailing newline or space, and without trimming
  // that produces a length mismatch and a 401 on every automation with no
  // visible difference between the two values. Trimming cannot weaken the
  // check -- a secret is never intended to have leading/trailing space.
  const expected = (process.env.CRON_SECRET ?? "").trim();

  if (expected.length === 0) {
    logger.warn("cron auth: CRON_SECRET is not set, endpoint is unauthenticated", {
      path: new URL(request.url).pathname,
    });
    return null;
  }

  const provided = (request.headers.get("x-cron-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    logger.warn("cron auth: rejected request with missing or invalid x-cron-secret", {
      path: new URL(request.url).pathname,
    });
    return NextResponse.json({ status: "error", error: "unauthorized" }, { status: 401 });
  }

  return null;
}

/**
 * Constant-time comparison. timingSafeEqual throws on length mismatch --
 * which would itself leak the expected length -- so both sides are hashed
 * to a fixed width first via a length-independent encoding.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still burn a comparison of equal-length buffers so the early return
    // costs the same as a genuine mismatch.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
