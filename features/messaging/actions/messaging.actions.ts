"use server";

import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { requirePermission } from "@/lib/rbac/session";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { normalizeIndonesianPhone, whatsAppSendSchema, type WhatsAppSendInput } from "../schemas/messaging.schema";

/** super_admin only (messaging.send) -- can reach any phone number, not just employees on file, so it stays behind its own permission rather than riding on an existing broad one. */
export async function sendWhatsAppMessageAction(input: WhatsAppSendInput): Promise<ActionResult> {
  await requirePermission("messaging.send");

  const parsed = whatsAppSendSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const result = await sendWhatsAppText(normalizeIndonesianPhone(parsed.data.phone), parsed.data.message.trim());
  if (!result.success) return actionError(result.error ?? "Gagal mengirim pesan WhatsApp");

  return actionSuccess();
}
