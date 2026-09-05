import { NextResponse } from "next/server";

import { sendWhatsAppImage, sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off internal utility: send a plain WhatsApp text (or, with imageUrl,
 * an image + caption) to an arbitrary phone number through this app's
 * already-paired device, for cases with no existing trigger to hang the
 * send off of (e.g. onboarding a brand new contractor_wa_senders row before
 * they've ever messaged in, or manually re-forwarding a bukti transfer photo
 * that was reconciled directly in the database instead of through the normal
 * WhatsApp flow). Guarded the same way every other automation-only endpoint
 * in this app is (requireCronAuth) -- only callable via automation_post()
 * from Postgres (which reads the secret from automation_config server-side)
 * or a caller that already holds CRON_SECRET, never from a browser or an
 * unauthenticated request.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  let body: { phone?: unknown; message?: unknown; imageUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "invalid JSON body" }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!phone || !message) {
    return NextResponse.json({ status: "error", error: "phone and message are required" }, { status: 400 });
  }
  if (message.length > 4096) {
    return NextResponse.json({ status: "error", error: "message exceeds 4096 characters" }, { status: 400 });
  }

  const result = imageUrl ? await sendWhatsAppImage(phone, imageUrl, message) : await sendWhatsAppText(phone, message);
  if (!result.success) {
    logger.warn("send-wa-message: WhatsApp send failed", { error: result.error });
  }

  return NextResponse.json({ status: result.success ? "ok" : "error", error: result.error }, { status: result.success ? 200 : 502 });
}
