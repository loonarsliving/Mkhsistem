import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

/**
 * Shared-secret guard for /api/files/agent/* -- the only endpoints the
 * Mac Mini local agent (Filemanager repo) talks to. Deliberately FAIL-CLOSED
 * on an unset secret, unlike lib/security/cron-auth.ts's deliberate
 * fail-open: CRON_SECRET's fail-open exists to give a zero-downtime rollout
 * window for endpoints that were already live and unauthenticated. These
 * routes are new -- there is no prior "already exposed" behavior to
 * preserve -- and what they guard is broader than a cron tick: /sync
 * accepts a full catalog of company file metadata, and
 * /requests/:id/deliver accepts raw file bytes to be pushed out over
 * WhatsApp. An unset FILE_AGENT_SHARED_SECRET should mean "the agent isn't
 * configured yet", not "anyone can call this".
 */
export function requireFileAgentAuth(request: Request): NextResponse | null {
  const expected = (process.env.FILE_AGENT_SHARED_SECRET ?? "").trim();
  const path = new URL(request.url).pathname;

  if (expected.length === 0) {
    logger.warn("file agent auth: FILE_AGENT_SHARED_SECRET is not set, rejecting request", { path });
    return NextResponse.json({ status: "error", error: "file agent is not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-file-agent-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`file-agent-auth:${path}:${getClientIp(request)}`);
    if (limited) {
      logger.warn("file agent auth: rate-limited after repeated invalid x-file-agent-secret attempts", { path });
      return NextResponse.json({ status: "error", error: "too many attempts" }, { status: 429 });
    }
    logger.warn("file agent auth: rejected request with missing or invalid x-file-agent-secret", { path });
    return NextResponse.json({ status: "error", error: "unauthorized" }, { status: 401 });
  }

  return null;
}

/** Constant-time comparison -- see cron-auth.ts's identical helper for why. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
