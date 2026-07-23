import { WHATSAPP_CONFIG, isWhatsAppConfigured } from "../config";
import { createFetchWhatsAppHttpClient } from "./whatsapp-http-client";
import { WhatsAppConnector } from "./whatsapp-connector";

let cachedWhatsApp: WhatsAppConnector | null = null;

/**
 * AI Connector Layer — the registry of external channels the AI Service can
 * dispatch through. Only WhatsApp is wired today; adding a 2nd connector
 * (Telegram, email, ...) means adding one more getXConnector()-style
 * function here, mirroring Aiagent's ConnectorManager without carrying over
 * the generic multi-connector registry machinery this app doesn't need yet.
 */
export function getWhatsAppConnector(): WhatsAppConnector | null {
  if (!isWhatsAppConfigured()) return null;
  if (cachedWhatsApp) return cachedWhatsApp;
  const http = createFetchWhatsAppHttpClient(WHATSAPP_CONFIG.accessToken);
  cachedWhatsApp = new WhatsAppConnector(
    {
      accessToken: WHATSAPP_CONFIG.accessToken,
      phoneNumberId: WHATSAPP_CONFIG.phoneNumberId,
      businessAccountId: WHATSAPP_CONFIG.businessAccountId,
      verifyToken: WHATSAPP_CONFIG.verifyToken,
      whacenterDeviceId: WHATSAPP_CONFIG.whacenterDeviceId,
    },
    http,
  );
  return cachedWhatsApp;
}

/**
 * Meta's GET verification handshake only needs WHATSAPP_VERIFY_TOKEN — it
 * must NOT depend on getWhatsAppConnector()/isWhatsAppConfigured(), which
 * also requires WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID/BUSINESS_ACCOUNT_ID to
 * be set. Gating verification behind all four previously meant a webhook
 * with a perfectly correct verify token would still fail verification if
 * any of the other three (unrelated to verification) had an issue. Values
 * are trimmed defensively against a trailing newline/space from
 * copy-pasting into the Vercel dashboard.
 */
export function verifyWhatsAppWebhookChallenge(mode: string | null, token: string | null): boolean {
  const expected = WHATSAPP_CONFIG.verifyToken.trim();
  return mode === "subscribe" && expected.length > 0 && token !== null && token.trim() === expected;
}
