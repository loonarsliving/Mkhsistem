import { saveIntegrationLog } from "../integration-log";
import type { WhatsAppHttpClient } from "./whatsapp-http-client";
import type { HealthCheckResult, NormalizedInboundMessage, OutboundMessageContent, SendResult, WebhookResult } from "./types";

export interface WhatsAppConnectorConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
  whacenterDeviceId: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
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
 * Strips everything but digits before a number ever reaches Whacenter --
 * root-caused a real incident where an employee's phone field had invisible
 * Unicode bidi-control characters (U+202A/U+202C, likely a copy-paste
 * artifact) wrapping the digits. Whacenter's /send still returned HTTP 200
 * for that malformed number (it accepts the job, doesn't validate the
 * number synchronously), so the failure was completely silent -- nothing in
 * ai_integration_logs showed an error, the message just never arrived. This
 * runs for every outbound send regardless of caller (notifications, AI
 * replies, ad-hoc messaging, promo broadcasts), so a bad phone value from
 * any source is defused here once instead of needing every call site to
 * remember to sanitize.
 */
function sanitizeRecipientNumber(recipient: string): string {
  return recipient.replace(/[^0-9]/g, "");
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

  /** Checks the Whacenter device's own session state (GET /statusDevice?device_id=...) -- CONNECTED means the paired phone's WhatsApp session is live and able to send. */
  async healthCheck(): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    try {
      const response = await this.http.get(`/statusDevice?device_id=${this.config.whacenterDeviceId}`);
      const latencyMs = Date.now() - startedAt;
      const data = asRecord(asRecord(response.json)?.data);
      const deviceStatus = typeof data?.status === "string" ? data.status : undefined;
      const ok = response.ok && deviceStatus === "CONNECTED";
      const phone = typeof data?.phone === "string" ? data.phone : undefined;
      await saveIntegrationLog({
        connector: "whatsapp",
        direction: "outgoing",
        payload: { kind: "healthCheck" },
        status: ok ? "success" : "error",
        responseStatus: response.status,
        error: ok ? undefined : (deviceStatus ?? extractErrorMessage(response.json)),
        latencyMs,
      });
      return {
        ok,
        detail: ok
          ? `Whacenter device connected${phone ? ` (${phone})` : ""} (${latencyMs}ms)`
          : `Whacenter device status: ${deviceStatus ?? `HTTP ${response.status} ${extractErrorMessage(response.json)}`}`,
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
      return { ok: false, detail: `Whacenter unreachable: ${message}` };
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

  /**
   * Whacenter's real /send API is flat -- {device_id, number, message, file?}
   * -- NOT Meta Cloud API's typed message objects (type/image/document/
   * interactive). `file` (a publicly reachable URL) is what actually
   * attaches an image/document; `message` is plain text (used as the
   * caption when `file` is present). Confirmed against Whacenter's own PHP
   * example (order.whacenter.com/docs) after the previous Meta-shaped image
   * payload was silently getting JSON.stringify'd into the message field
   * instead of ever attaching a real file -- Whacenter has no native
   * template/button message type, so those two kinds degrade to a plain
   * text approximation (best-effort; neither is actually used anywhere in
   * this app yet).
   */
  normalizeOutgoingMessage(content: OutboundMessageContent): { message: string; file?: string } {
    if (content.kind === "image") {
      return { message: content.caption ?? "", file: content.url };
    }
    if (content.kind === "pdf") {
      return { message: content.filename, file: content.url };
    }
    if (content.kind === "template") {
      const values = Object.values(content.params);
      return { message: values.length ? values.join(" ") : content.templateName };
    }
    if (content.kind === "buttons") {
      const options = content.buttons.map((button, i) => `${i + 1}. ${button.label}`).join("\n");
      return { message: `${content.text}\n\n${options}` };
    }
    return { message: content.text };
  }

  private async dispatch(recipient: string, outgoing: { message: string; file?: string }): Promise<SendResult> {
    const sanitizedNumber = sanitizeRecipientNumber(recipient);
    if (sanitizedNumber.length < 8) {
      const result: SendResult = { success: false, error: `Recipient number has no usable digits after sanitizing: "${recipient}"` };
      await this.logOutgoing({ device_id: this.config.whacenterDeviceId, number: recipient }, result, 0, 0);
      return result;
    }

    const body: Record<string, unknown> = {
      device_id: this.config.whacenterDeviceId,
      number: sanitizedNumber,
      message: outgoing.message,
    };
    if (outgoing.file) body.file = outgoing.file;
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

  /**
   * Whacenter's own flat webhook shape -- NOT Meta's official Cloud API
   * format (entry[0].changes[0].value.messages[0]), which this previously
   * (incorrectly) assumed and silently dropped every real inbound message
   * as a result. Real payload: {pushName, from, to, message, media,
   * is_group, timestamp, source: "WHACENTER", ad_reply: {source_type,
   * source_id, source_url}}. ad_reply carries real values when the chat was
   * opened by tapping a Click-to-WhatsApp ad -- that's the ad-lead-routing
   * signal (see lib/ai/domains/ad-lead-routing.ts).
   */
  normalizeIncomingMessage(rawPayload: unknown): NormalizedInboundMessage | null {
    const payload = asRecord(rawPayload);
    if (!payload) return null;
    if (payload.is_group === true) return null;

    const sender = payload.from;
    if (typeof sender !== "string" || sender.length === 0) return null;

    const pushName = typeof payload.pushName === "string" && payload.pushName.length > 0 ? payload.pushName : undefined;
    const messageText = typeof payload.message === "string" ? payload.message : "";

    const adReplyRaw = asRecord(payload.ad_reply);
    const sourceId = typeof adReplyRaw?.source_id === "string" && adReplyRaw.source_id.length > 0 ? adReplyRaw.source_id : null;
    const adReferral = sourceId
      ? {
          sourceId,
          sourceType: typeof adReplyRaw?.source_type === "string" ? adReplyRaw.source_type : "ad",
          sourceUrl: typeof adReplyRaw?.source_url === "string" ? adReplyRaw.source_url : undefined,
        }
      : null;

    // media shape is UNVERIFIED against a real Whacenter image webhook (no
    // documented schema, this codebase's usual "fix once a real payload
    // proves the shape wrong" situation) -- tries the field names Whacenter
    // most plausibly uses, and falls through to text/raw if none match
    // rather than crashing on an unexpected shape.
    const mediaRaw = payload.media;
    let imageUrl: string | null = null;
    if (typeof mediaRaw === "string" && mediaRaw.length > 0) {
      imageUrl = mediaRaw;
    } else {
      const mediaRecord = asRecord(mediaRaw);
      const candidate = mediaRecord?.url ?? mediaRecord?.link ?? mediaRecord?.mediaUrl ?? mediaRecord?.file;
      if (typeof candidate === "string" && candidate.length > 0) imageUrl = candidate;
    }

    const content = imageUrl
      ? ({ kind: "image", url: imageUrl, caption: messageText.length > 0 ? messageText : undefined } as const)
      : messageText.length > 0
        ? ({ kind: "text", text: messageText } as const)
        : ({ kind: "raw", text: JSON.stringify(payload) } as const);

    return { sender, senderName: pushName, content, receivedAt: new Date().toISOString(), adReferral };
  }
}
