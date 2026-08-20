import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Codes older than this are treated as expired even if never consumed --
// mirrors the pg_cron sweep in migration 0236, just enforced synchronously
// too so a code can't be used in the gap before the next sweep tick.
const CODE_TTL_MS = 60_000;

/**
 * Server-to-server counterpart to GET /api/sso/loonars-sales: exchanges a
 * short-lived, single-use opaque code (minted there, staged in
 * sso_exchange_codes) for the real Supabase session access_token, so the
 * token itself never has to travel through a browser-visible URL.
 *
 * Contract for the receiving app (loonars-sales):
 *   POST here with `{ "code": "<the code from ?code=...>" }` from ITS OWN
 *   BACKEND (never from the browser -- this response IS the credential),
 *   immediately after redirecting the user in from /sso. A code is valid
 *   for 60 seconds from mint time and works exactly once; either limit
 *   hit returns 401/410. On success the code is deleted so a replayed
 *   request (retry, log replay, etc.) can never succeed twice.
 *
 * No session/shared-secret auth on this route itself -- by design, same as
 * /api/ai/process-job's claim-by-id pattern (see lib/supabase/middleware.ts):
 * the code IS the credential, is unguessable (32 random bytes), single-use,
 * and expires in 60s, so listing this path in PUBLIC_PATHS doesn't weaken
 * anything a session check would have caught.
 */
export async function POST(request: Request) {
  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin.from("sso_exchange_codes").select("access_token, created_at, consumed_at").eq("code", code).maybeSingle();

  if (error) {
    logger.error("sso/loonars-sales/exchange: lookup failed", { error: error.message });
    return NextResponse.json({ error: "exchange unavailable" }, { status: 503 });
  }

  const ip = getClientIp(request);
  const isExpiredOrUsed = !row || row.consumed_at !== null || Date.now() - new Date(row.created_at).getTime() > CODE_TTL_MS;
  if (isExpiredOrUsed) {
    const limited = recordAuthFailure(`sso-exchange:${ip}`);
    logger.warn("sso/loonars-sales/exchange: rejected unknown/expired/already-used code");
    return NextResponse.json({ error: "invalid or expired code" }, { status: limited ? 429 : 401 });
  }

  // Delete rather than just mark consumed -- the access_token has no
  // further reason to sit in the table at all once handed off once.
  const { error: deleteError } = await admin.from("sso_exchange_codes").delete().eq("code", code);
  if (deleteError) {
    // Fails closed: if we can't guarantee the code is now consumed, don't
    // hand back the token -- a stuck row here just gets swept by the
    // pg_cron cleanup in migration 0236 instead of enabling reuse.
    logger.error("sso/loonars-sales/exchange: failed to delete consumed code", { error: deleteError.message });
    return NextResponse.json({ error: "exchange unavailable" }, { status: 503 });
  }

  return NextResponse.json({ access_token: row.access_token });
}
