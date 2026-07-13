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

  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const envConfigured = expected.trim().length > 0;
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

  // TEMPORARY DIAGNOSTIC RESPONSE — remove once verification is confirmed
  // working. Deliberately does NOT echo the actual token values: this route
  // is unauthenticated and public by necessity (Meta must reach it without
  // auth), so anything in this JSON body is readable by anyone who requests
  // the URL, not just the operator debugging it. Lengths + exact/trimmed
  // match results are enough to diagnose a wrong value, extra whitespace,
  // or truncation without publishing the secret itself.
  return NextResponse.json(
    {
      error: "webhook verification failed",
      mode,
      challenge_present: challenge !== null,
      received_verify_token_present: token !== null,
      received_verify_token_length: token?.length ?? 0,
      expected_verify_token_configured: envConfigured,
      expected_verify_token_length: expected.length,
      tokens_match_exact: token !== null && token === expected,
      tokens_match_trimmed: token !== null && token.trim() === expected.trim(),
      access_token_exists: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      phone_number_id_exists: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      business_account_exists: Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    },
    { status: 403 },
  );
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
