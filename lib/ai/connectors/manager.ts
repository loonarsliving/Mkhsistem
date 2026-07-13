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
    },
    http,
  );
  return cachedWhatsApp;
}

export function verifyWhatsAppWebhookChallenge(mode: string | null, token: string | null): boolean {
  const connector = getWhatsAppConnector();
  return connector ? connector.verifyWebhook(mode, token) : false;
}
