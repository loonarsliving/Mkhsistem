import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bridge endpoint for external systems (currently: the villa reservation
 * system's `villa-api` Supabase Edge Function) to send an outbound WhatsApp
 * message through this app's already-paired Whacenter device, without going
 * through any intermediate "file hub" service. Guarded by a shared secret
 * (VILLA_BRIDGE_SECRET) rather than a session/user login, since the caller
 * is a server, not a browser.
 */

/** Constant-time comparison, same approach as lib/security/cron-auth.ts. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (expected.length === 0) {
    logger.error("wa/send: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    logger.warn("wa/send: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { phone?: unknown; message?: unknown; booking_id?: unknown; unit_id?: unknown; template_type?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone : "";
  const message = typeof body.message === "string" ? body.message : "";
  if (!phone || !message) {
    return NextResponse.json({ success: false, error: "phone and message are required" }, { status: 400 });
  }

  const result = await sendWhatsAppText(phone, message);
  if (!result.success) {
    logger.warn("wa/send: WhatsApp send failed", {
      template_type: typeof body.template_type === "string" ? body.template_type : undefined,
      booking_id: typeof body.booking_id === "string" ? body.booking_id : undefined,
      unit_id: typeof body.unit_id === "string" ? body.unit_id : undefined,
      error: result.error,
    });
  }

  return NextResponse.json({ success: result.success, error: result.error }, { status: result.success ? 200 : 502 });
}
