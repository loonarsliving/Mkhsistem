import { saveIntegrationLog } from "../integration-log";
import type { WhatsAppHttpClient } from "./whatsapp-http-client";
import type { HealthCheckResult, NormalizedInboundMessage, OutboundMessageContent, SendResult, WebhookResult } from "./types";

export interface WhatsAppConnectorConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Walks a Meta Cloud API webhook payload down to `entry[0].changes[0].value.messages[0]`. */
function extractFirstMessage(rawPayload: unknown): Record<string, unknown> | null {
  const entry = asRecord(rawPayload)?.entry;
  if (!Array.isArray(entry) || entry.length === 0) return null;
  const changes = asRecord(entry[0])?.changes;
  if (!Array.isArray(changes) || changes.length === 0) return null;
  const value = asRecord(changes[0])?.value;
  const messages = asRecord(value)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  return asRecord(messages[0]);
}

function extractErrorMessage(json: unknown): string {
  const error = asRecord(asRecord(json)?.error);
  return typeof error?.message === "string" ? error.message : "unknown error";
}

function extractMessageId(json: unknown): string | undefined {
  const messages = asRecord(json)?.messages;
  if (Array.isArray(messages)) {
    const id = asRecord(messages[0])?.id;
    if (typeof id === "string") return id;
  }
  return undefined;
}

/**
 * Real WhatsApp Cloud API connector — ported from Aiagent's Sprint 4B
 * WhatsAppCloudConnector (packages/integrations/src/connectors/whatsapp-cloud-connector.ts).
 * Every call is logged via saveIntegrationLog (ai_integration_logs), same as
 * the source project's Repository-backed logging.
 */
export class WhatsAppConnector {
  readonly type = "whatsapp" as const;

  constructor(
    private readonly config: WhatsAppConnectorConfig,
    private readonly http: WhatsAppHttpClient,
  ) {}

  private async logOutgoing(payload: unknown, result: SendResult, responseStatus: number, latencyMs: number): Promise<void> {
    await saveIntegrationLog({
      connector: "whatsapp",
      direction: "outgoing",
      payload,
      status: result.success ? "success" : "error",
      responseStatus,
      error: result.error,
      latencyMs,
    });
  }

  /** Validates credentials against the real Graph API by reading back the phone number's own metadata. */
  async healthCheck(): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    try {
      const response = await this.http.get(`/${this.config.phoneNumberId}?fields=verified_name,display_phone_number`);
      const latencyMs = Date.now() - startedAt;
      const ok = response.ok;
      await saveIntegrationLog({
        connector: "whatsapp",
        direction: "outgoing",
        payload: { kind: "healthCheck" },
        status: ok ? "success" : "error",
        responseStatus: response.status,
        error: ok ? undefined : extractErrorMessage(response.json),
        latencyMs,
      });
      return {
        ok,
        detail: ok
          ? `WhatsApp Cloud API reachable (${latencyMs}ms)`
          : `WhatsApp Cloud API returned ${response.status}: ${extractErrorMessage(response.json)}`,
      };
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      await saveIntegrationLog({
        connector: "whatsapp",
        direction: "outgoing",
        payload: { kind: "healthCheck" },
        status: "error",
        error: message,
        latencyMs,
      });
      return { ok: false, detail: `WhatsApp Cloud API unreachable: ${message}` };
    }
  }

  async sendMessage(recipient: string, content: OutboundMessageContent): Promise<SendResult> {
    return this.dispatch(recipient, this.normalizeOutgoingMessage(content));
  }

  async sendTemplate(recipient: string, templateName: string, params: Record<string, string>): Promise<SendResult> {
    return this.dispatch(recipient, this.normalizeOutgoingMessage({ kind: "template", templateName, params }));
  }

  async sendMedia(recipient: string, url: string, caption?: string): Promise<SendResult> {
    return this.dispatch(recipient, this.normalizeOutgoingMessage({ kind: "image", url, caption }));
  }

  normalizeOutgoingMessage(content: OutboundMessageContent): Record<string, unknown> {
    if (content.kind === "template") {
      const values = Object.values(content.params);
      return {
        type: "template",
        template: {
          name: content.templateName,
          language: { code: "id" },
          components: values.length ? [{ type: "body", parameters: values.map((value) => ({ type: "text", text: value })) }] : [],
        },
      };
    }
    if (content.kind === "image") {
      return { type: "image", image: { link: content.url, caption: content.caption } };
    }
    if (content.kind === "pdf") {
      return { type: "document", document: { link: content.url, filename: content.filename } };
    }
    if (content.kind === "buttons") {
      return {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: content.text },
          action: { buttons: content.buttons.map((button) => ({ type: "reply", reply: { id: button.id, title: button.label } })) },
        },
      };
    }
    return { type: "text", text: { body: content.text } };
  }

  private async dispatch(recipient: string, messageBody: Record<string, unknown>): Promise<SendResult> {
    const body = {
  device_id: process.env.WHACENTER_DEVICE_ID!,
  number: recipient,
  message:
  "text" in messageBody
    ? messageBody.text.body
    : JSON.stringify(messageBody),
    };
    const startedAt = Date.now();
    try {
      const response = await this.http.post(
  "/send",
  body
);
      const latencyMs = Date.now() - startedAt;
      const result: SendResult = response.ok
        ? { success: true, externalId: extractMessageId(response.json) }
        : { success: false, error: `Graph API returned ${response.status}: ${extractErrorMessage(response.json)}` };
      await this.logOutgoing(body, result, response.status, latencyMs);
      return result;
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const result: SendResult = { success: false, error: err instanceof Error ? err.message : String(err) };
      await this.logOutgoing(body, result, 0, latencyMs);
      return result;
    }
  }

  /** Meta's webhook verification handshake. */
  verifyWebhook(mode: string | null, token: string | null): boolean {
    return mode === "subscribe" && token === this.config.verifyToken;
  }

  async receiveWebhook(rawPayload: unknown): Promise<WebhookResult> {
    const normalized = this.normalizeIncomingMessage(rawPayload);
    await saveIntegrationLog({
      connector: "whatsapp",
      direction: "incoming",
      payload: rawPayload,
      status: normalized ? "success" : "error",
      responseStatus: normalized ? 200 : 400,
      error: normalized ? undefined : "unrecognized WhatsApp webhook payload shape (or a non-message event, e.g. a status callback)",
    });
    if (!normalized) {
      return { accepted: false, reason: "unrecognized WhatsApp webhook payload shape (or a non-message event, e.g. a status callback)" };
    }
    return { accepted: true, normalized };
  }

  /** Only `text` messages are parsed into structured content; every other type is preserved as `raw` JSON rather than dropped. */
  normalizeIncomingMessage(rawPayload: unknown): NormalizedInboundMessage | null {
    const message = extractFirstMessage(rawPayload);
    if (!message) return null;
    const sender = message.from;
    if (typeof sender !== "string") return null;

    if (message.type === "text") {
      const text = asRecord(message.text)?.body;
      if (typeof text === "string") {
        return { sender, content: { kind: "text", text }, receivedAt: new Date().toISOString() };
      }
    }
    return { sender, content: { kind: "raw", text: JSON.stringify(message) }, receivedAt: new Date().toISOString() };
  }
}
