/**
 * Channel-agnostic outbound message body — every connector's send* method
 * accepts this same shape. Ported from Aiagent's OutboundMessageContent
 * (packages/shared/src/types.ts), trimmed to the content kinds the WhatsApp
 * connector actually implements.
 */
export type OutboundMessageContent =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; caption?: string }
  | { kind: "pdf"; url: string; filename: string }
  | { kind: "template"; templateName: string; params: Record<string, string> }
  | { kind: "buttons"; text: string; buttons: { id: string; label: string }[] };

export interface SendResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

/** Present only when Whacenter's `ad_reply` carries a real source_id -- i.e. this message opened from someone clicking a Click-to-WhatsApp ad, not an organic chat. */
export interface AdReferral {
  sourceId: string;
  sourceType: string;
  sourceUrl?: string;
}

export interface NormalizedInboundMessage {
  sender: string;
  /** Whacenter's `pushName` -- the sender's WhatsApp display name, when present. */
  senderName?: string;
  content: { kind: "text"; text: string } | { kind: "raw"; text: string };
  receivedAt: string;
  adReferral?: AdReferral | null;
}

export interface WebhookResult {
  accepted: boolean;
  normalized?: NormalizedInboundMessage;
  reason?: string;
}

export interface HealthCheckResult {
  ok: boolean;
  detail: string;
}
