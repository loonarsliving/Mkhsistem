import { getWhatsAppConnector } from "../connectors/manager";
import type { OutboundMessageContent, SendResult } from "../connectors/types";

/**
 * Notification Engine — channel-agnostic outbound dispatch. WhatsApp is the
 * only channel wired today (per the "use WhatsApp Cloud API as the primary
 * notification medium" requirement); the shape stays channel-agnostic
 * (`content: OutboundMessageContent`) so a future channel is an additive
 * change here, not a rewrite. Ported concept from Aiagent's NotificationEngine.
 */
export async function sendWhatsAppNotification(recipientPhone: string, content: OutboundMessageContent): Promise<SendResult> {
  const connector = getWhatsAppConnector();
  if (!connector) {
    return { success: false, error: "WhatsApp connector not configured (WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID/BUSINESS_ACCOUNT_ID/VERIFY_TOKEN)" };
  }
  return connector.sendMessage(recipientPhone, content);
}

export async function sendWhatsAppText(recipientPhone: string, text: string): Promise<SendResult> {
  return sendWhatsAppNotification(recipientPhone, { kind: "text", text });
}

export async function sendWhatsAppImage(recipientPhone: string, url: string, caption?: string): Promise<SendResult> {
  return sendWhatsAppNotification(recipientPhone, { kind: "image", url, caption });
}

/**
 * Sends an arbitrary document (not just PDFs) as a WhatsApp attachment.
 * Named after the connector's "pdf" content kind for historical reasons
 * (see connectors/types.ts), but Whacenter's underlying /send API attaches
 * any file type identically (whatsapp-connector.ts's normalizeOutgoingMessage
 * just passes `file` through) -- used by the company file manager
 * (lib/ai/domains/file-request.ts) to deliver a file Filemanager (the
 * Mac Mini agent) has staged a short-lived download link for.
 */
export async function sendWhatsAppDocument(recipientPhone: string, url: string, filename: string): Promise<SendResult> {
  return sendWhatsAppNotification(recipientPhone, { kind: "pdf", url, filename });
}

interface CachedWhatsAppHealthCheck {
  result: { ok: boolean; detail: string };
  cachedAt: number;
}

let cachedWhatsAppHealthCheck: CachedWhatsAppHealthCheck | null = null;
const WHATSAPP_HEALTHCHECK_CACHE_MS = 300_000;

/** Mirrors lib/ai/service.ts's aiHealthCheck() caching: a successful result is reused for 5 minutes so repeated status checks (monitoring, dashboard) don't each hit the Whacenter gateway; a failure is never cached. */
export async function whatsAppHealthCheck(): Promise<{ ok: boolean; detail: string; configured: boolean }> {
  const connector = getWhatsAppConnector();
  if (!connector) {
    return { ok: false, detail: "WHACENTER_DEVICE_ID is not configured", configured: false };
  }

  if (cachedWhatsAppHealthCheck && Date.now() - cachedWhatsAppHealthCheck.cachedAt < WHATSAPP_HEALTHCHECK_CACHE_MS) {
    return { ...cachedWhatsAppHealthCheck.result, detail: `${cachedWhatsAppHealthCheck.result.detail} (cached)`, configured: true };
  }

  const result = await connector.healthCheck();
  if (result.ok) {
    cachedWhatsAppHealthCheck = { result, cachedAt: Date.now() };
  }
  return { ...result, configured: true };
}
