import "server-only";

import { logger } from "@/lib/logger";

/**
 * Villa: copy every inbound WhatsApp payload on this device (082228885223)
 * to villa's receptionist chat inbox (owner decision 2026-09-27 -- the
 * receptionist chats with guests from this number, and this device's
 * Whacenter webhook points here, not at villa).
 *
 * Villa's POST /api/wa/mirror records the message only if it's a villa
 * guest or someone asking about a stay, and answers `{ villa: boolean }`.
 * Villa already excludes this app's own employees and contractors (unless
 * they wrote through a loonars.id Private Living button, i.e. as a guest).
 * When `villa` is true the receptionist owns the conversation: villa sends
 * its one-time greeting itself, and this app must not answer with AI or
 * "pilih proyek" (see handleWhatsAppWebhookEvent). Commands (LUNAS,
 * PROMO, ...) are still handled here, before that check.
 *
 * Never throws. Resolves to false when villa can't be reached, rejects the
 * request, or doesn't answer in time -- callers then behave exactly as
 * before this existed: a villa outage must not cost Mkhsistem a single message.
 */

const VILLA_CHAT_MIRROR_URL = "https://living.haluoleo.id/api/wa/mirror";
const TIMEOUT_MS = 8_000;

/** Resolves true when villa's receptionist owns this conversation. */
export async function forwardToVillaChat(rawBody: string): Promise<boolean> {
  const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (!secret || !rawBody) return false;

  try {
    const res = await fetch(VILLA_CHAT_MIRROR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn("villa chat mirror rejected", { status: res.status });
      return false;
    }
    const json = (await res.json().catch(() => null)) as { villa?: unknown } | null;
    return json?.villa === true;
  } catch (err) {
    logger.warn("villa chat mirror unreachable", { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
