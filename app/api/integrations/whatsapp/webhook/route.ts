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
/** Redacts only the verify-token value out of a raw query string, keeping every key name, delimiter, and every other value intact for diagnosis. */
function redactVerifyToken(rawSearch: string): string {
  return rawSearch.replace(/(hub\.verify_token=)[^&]*/i, "$1[REDACTED]");
}

export async function GET(request: NextRequest) {
  // Raw, unparsed request data — logged (server-side only) BEFORE any
  // searchParams parsing, so a mismatch between what Meta actually sent and
  // what .get("hub.xxx") resolves to is visible instead of assumed.
  const rawUrl = request.url;
  const rawSearch = request.nextUrl.search;
  const rawPath = request.nextUrl.pathname;
  const searchParamKeys = Array.from(request.nextUrl.searchParams.keys());

  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const envConfigured = expected.trim().length > 0;
  const verified = Boolean(challenge) && verifyWhatsAppWebhookChallenge(mode, token);

  // TEMPORARY diagnostic logging for the Meta verification handshake bug —
  // never logs the token value itself, only presence/shape/comparison result.
  // rawUrl/rawSearch go to the server log only (Vercel logs), never into the
  // public JSON response below, since they'd contain hub.verify_token in
  // plaintext if it were present.
  logger.info("WhatsApp webhook GET verification attempt", {
    rawUrl,
    rawPath,
    rawSearchRedacted: redactVerifyToken(rawSearch),
    searchParamKeys,
    hubMode: mode,
    hubVerifyTokenPresent: token !== null,
    hubVerifyTokenLength: token?.length ?? 0,
    hubChallengePresent: challenge !== null,
    envVarConfigured: envConfigured,
    verificationResult: verified,
  });

  if (verified) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // TEMPORARY DIAGNOSTIC RESPONSE — remove once verification is confirmed
  // working. Deliberately does NOT echo the actual token value: this route
  // is unauthenticated and public by necessity (Meta must reach it without
  // auth), so anything in this JSON body is readable by anyone who requests
  // the URL, not just the operator debugging it. path/param-key-names/
  // redacted-query-string/lengths/match booleans are enough to tell "Meta
  // never sent hub.* params" apart from "it sent them but the value/name
  // was wrong" without publishing the secret itself.
  return NextResponse.json(
    {
      error: "webhook verification failed",
      raw_path: rawPath,
      raw_search_redacted: redactVerifyToken(rawSearch),
      search_param_keys: searchParamKeys,
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
/** TEMPORARY — PRESENT/MISSING only, never the actual value, for tracing which of the 4 WhatsApp vars (and Gemini's) this exact running deployment actually sees at runtime. */
function envPresenceSnapshot() {
  return {
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN ? "PRESENT" : "MISSING",
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ? "PRESENT" : "MISSING",
    WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ? "PRESENT" : "MISSING",
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN ? "PRESENT" : "MISSING",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "PRESENT" : "MISSING",
  };
}

export async function POST(request: NextRequest) {
  // TEMPORARY: unconditional receipt log+env snapshot, independent of
  // whether the body parses or the connector is configured — previously
  // this handler logged nothing at all on the "ignored" path (unconfigured
  // connector) or the success path, so there was no server-side evidence a
  // POST arrived, and no way to see which env var this exact running
  // deployment actually resolves at request time (Vercel env var changes
  // require a fresh deployment to take effect on already-running functions
  // -- the dashboard showing a value set does not guarantee a given
  // deployment's runtime sees it).
  const envSnapshot = envPresenceSnapshot();
  logger.info("WhatsApp webhook POST received", { contentLength: request.headers.get("content-length"), env: envSnapshot });

  const body = await request.json().catch(() => null);
  if (body === null) {
    logger.info("WhatsApp webhook POST body did not parse as JSON");
    return NextResponse.json({ status: "error", reason: "invalid JSON body", trace: ["entry", "json_parse:failed"], env: envSnapshot }, { status: 400 });
  }

  try {
    const result = await handleWhatsAppWebhookEvent(body);
    logger.info("WhatsApp webhook POST handled", { status: result.status, reason: result.reason, replySent: result.replySent, trace: result.trace });
    // TEMPORARY: env snapshot + full step trace returned in the response
    // body itself (not just the server log), since runtime log access has
    // been unavailable for this investigation -- this makes the trace
    // provable from the HTTP response of any test POST, Meta's or manual.
    return NextResponse.json({ ...result, env: envSnapshot }, { status: 200 });
  } catch (err) {
    logger.error("WhatsApp webhook handling failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ status: "error", trace: ["entry", "json_parse:ok", "handleWhatsAppWebhookEvent:threw"], env: envSnapshot }, { status: 200 });
  }
}
