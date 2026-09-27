import "server-only";

import { logger } from "@/lib/logger";

/**
 * Villa: copy every inbound WhatsApp payload on this device (082228885223)
 * to villa's receptionist chat inbox (owner decision 2026-09-27 -- the
 * receptionist chats with guests from this number, and this device's
 * Whacenter webhook points here, not at villa).
 *
 * Villa's POST /api/wa/mirror only RECORDS the message. Commands (LUNAS,
 * PROMO, ...) are still handled here only, so the owner never gets two
 * confirmations for one command.
 *
 * Never throws and never blocks this webhook's own handling beyond the
 * timeout below: a villa outage must not cost Mkhsistem a single message.
 */

const VILLA_CHAT_MIRROR_URL = "https://living.haluoleo.id/api/wa/mirror";
const TIMEOUT_MS = 8_000;

export async function forwardToVillaChat(rawBody: string): Promise<void> {
  const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (!secret || !rawBody) return;

  try {
    const res = await fetch(VILLA_CHAT_MIRROR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) logger.warn("villa chat mirror rejected", { status: res.status });
  } catch (err) {
    logger.warn("villa chat mirror unreachable", { error: err instanceof Error ? err.message : String(err) });
  }
}
