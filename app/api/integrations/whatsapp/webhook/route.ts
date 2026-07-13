import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { verifyWhatsAppWebhookChallenge } from "@/lib/ai/connectors/manager";
import { handleWhatsAppWebhookEvent } from "@/lib/ai/webhook-handler";

export const dynamic = "force-dynamic";

/**
 * Meta's webhook verification handshake — called once when this URL is
 * registered in the Meta Developer dashboard (WhatsApp > Configuration >
 * Webhook), and again any time the subscription is re-verified. Returns
 * `hub.challenge` verbatim only when `hub.verify_token` matches
 * WHATSAPP_VERIFY_TOKEN; otherwise 403, per Meta's spec.
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const envConfigured = typeof process.env.WHATSAPP_VERIFY_TOKEN === "string" && process.env.WHATSAPP_VERIFY_TOKEN.trim().length > 0;
  const verified = Boolean(challenge) && verifyWhatsAppWebhookChallenge(mode, token);

  // TEMPORARY diagnostic logging for the Meta verification handshake bug —
  // never logs the token value itself, only presence/shape/comparison result.
  logger.info("WhatsApp webhook GET verification attempt", {
    hubMode: mode,
    hubVerifyTokenPresent: token !== null,
    hubVerifyTokenLength: token?.length ?? 0,
    hubChallengePresent: challenge !== null,
    envVarConfigured: envConfigured,
    verificationResult: verified,
  });

  if (verified) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "webhook verification failed" }, { status: 403 });
}

/**
 * Receives every WhatsApp Cloud API event Meta sends (incoming messages,
 * delivery/read status callbacks, ...). Always acknowledges with 200 — per
 * Meta's guidance, a non-200 response causes Meta to retry and eventually
 * disable the subscription — so even a payload we can't process is
 * acknowledged and the failure recorded in ai_integration_logs instead of
 * surfaced as an HTTP error to Meta. Only a genuinely unparseable request
 * body is rejected outright.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ status: "error", reason: "invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await handleWhatsAppWebhookEvent(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logger.error("WhatsApp webhook handling failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
