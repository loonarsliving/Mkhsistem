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
