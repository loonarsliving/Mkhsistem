import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { verifyWhatsAppWebhookChallenge } from "@/lib/ai/connectors/manager";
import { handleWhatsAppWebhookEvent } from "@/lib/ai/webhook-handler";
import { saveIntegrationLog } from "@/lib/ai/integration-log";

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

  // A request carrying hub.* params that FAILED to verify is a genuine
  // Meta Cloud API verification attempt with a wrong/missing token --
  // reject it per Meta's spec (403), and keep the diagnostic detail since
  // that's the one case actually worth debugging against WHATSAPP_VERIFY_TOKEN.
  if (mode !== null || token !== null || challenge !== null) {
    logger.info("WhatsApp webhook GET verification attempt with hub.* params failed", { rawUrl, rawPath });
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
      },
      { status: 403 },
    );
  }

  // No hub.* params at all -- not a Meta verification attempt. This is
  // almost certainly a third-party gateway (Whacenter, etc.) pinging the
  // URL to confirm it's reachable before saving it as a webhook endpoint.
  // Those gateways don't speak Meta's hub.challenge protocol and were
  // getting a hard 403 here, which read as "verification failed" in their
  // dashboard even though nothing was actually wrong -- a plain 200 lets
  // any such reachability check succeed without weakening Meta's own
  // token-checked handshake above.
  return NextResponse.json({ status: "ok", note: "WhatsApp webhook endpoint is reachable" }, { status: 200 });
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
  // TEMPORARY: absolute first action in POST() — before body parsing or any
  // other call. Unconditional entry marker, persisted to ai_integration_logs
  // so a raw hit to this endpoint is provable even if everything downstream
  // (JSON parsing, connector config, etc.) never runs.
  const entryMarker = `webhook_entry_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const entryTimestamp = new Date().toISOString();
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    requestHeaders[key] = value;
  });
  const rawBody = await request.text().catch(() => "");

  logger.info(entryMarker, { timestamp: entryTimestamp, headers: requestHeaders, rawBodyLength: rawBody.length });

  try {
    await saveIntegrationLog({
      connector: "whatsapp",
      direction: "incoming",
      payload: { source: "webhook_entry", marker: entryMarker, timestamp: entryTimestamp, headers: requestHeaders, rawBody },
      status: "success",
    });
  } catch (err) {
    console.error("webhook_entry log save failed", err instanceof Error ? err.message : String(err));
  }

  // --- normal execution continues, unchanged, except body is parsed from
  // the already-captured rawBody string (a Request body stream can only be
  // consumed once, and it was just consumed above via request.text()).
  const envSnapshot = envPresenceSnapshot();
  logger.info("WhatsApp webhook POST received", { contentLength: request.headers.get("content-length"), env: envSnapshot });

  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = null;
  }
  if (body === null) {
    // Empty/unparseable body -- most likely a gateway (Whacenter, etc.)
    // pinging this URL to verify it's reachable before saving it as a
    // webhook endpoint, not a real event. Same reasoning as Meta's own
    // "always ack with 200" guidance below: a non-200 here reads as
    // "verification failed" in the gateway's dashboard even though nothing
    // is actually wrong, so acknowledge instead of erroring.
    logger.info("WhatsApp webhook POST body did not parse as JSON -- acknowledging as a likely verification ping");
    return NextResponse.json({ status: "ok", reason: "empty or non-JSON body acknowledged", trace: ["entry", "json_parse:failed"], env: envSnapshot }, { status: 200 });
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
