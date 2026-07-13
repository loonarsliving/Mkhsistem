import { createAdminClient } from "@/lib/supabase/admin";

import { getWhatsAppConnector } from "./connectors/manager";
import type { NormalizedInboundMessage } from "./connectors/types";
import { sendWhatsAppText } from "./notifications/engine";
import { routeAndAnswer } from "./domains/router";

export interface WhatsAppWebhookHandlerResult {
  status: "processed" | "ignored" | "error";
  sender?: string;
  replySent?: boolean;
  reason?: string;
}

/** Keeps only digits, for tolerant matching against employees.phone (which may be stored with/without a leading +, spaces, or dashes). */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Best-effort match of a WhatsApp E.164 sender id against employees.phone — compares the last 9 digits (enough to disambiguate a local number regardless of country-code formatting differences). */
async function findEmployeeByPhone(sender: string) {
  const supabase = createAdminClient();
  const senderDigits = digitsOnly(sender);
  const suffix = senderDigits.slice(-9);
  if (suffix.length < 9) return null;

  const { data } = await supabase.from("employees").select("id, full_name, phone, role_id").not("phone", "is", null);
  return (data ?? []).find((employee) => digitsOnly(employee.phone ?? "").endsWith(suffix)) ?? null;
}

async function saveConversationTurn(sender: string, inbound: NormalizedInboundMessage, replyText: string | null, employeeId: string | null) {
  const supabase = createAdminClient();
  await supabase.from("ai_conversations").insert({
    connector: "whatsapp",
    sender,
    employee_id: employeeId,
    inbound_text: inbound.content.kind === "text" ? inbound.content.text : inbound.content.text,
    reply_text: replyText,
  });
}

/**
 * The full "receive one WhatsApp event" pipeline — normalize (via the
 * connector) -> resolve the sender to an employee if possible -> route to
 * the right AI domain (HR/Markom/CRM/general) through the AI Service ->
 * reply via the Notification Engine -> log the conversation. Ported concept
 * from Aiagent's handleWhatsAppWebhookEvent (packages/integrations/src/whatsapp-webhook-handler.ts),
 * simplified to MK Connect's single-connector, single-provider setup.
 */
export async function handleWhatsAppWebhookEvent(rawPayload: unknown): Promise<WhatsAppWebhookHandlerResult> {
  const connector = getWhatsAppConnector();
  if (!connector) {
    return { status: "ignored", reason: "WhatsApp connector not configured" };
  }

  const received = await connector.receiveWebhook(rawPayload);
  if (!received.accepted || !received.normalized) {
    return { status: "ignored", reason: received.reason };
  }

  const inbound = received.normalized;
  try {
    const employee = await findEmployeeByPhone(inbound.sender);
    const question = inbound.content.kind === "text" ? inbound.content.text : "";

    const replyText = question
      ? await routeAndAnswer(question, employee ? { id: employee.id, name: employee.full_name } : null)
      : "Maaf, MK Connect AI saat ini hanya dapat memproses pesan teks.";

    const sendResult = await sendWhatsAppText(inbound.sender, replyText);
    await saveConversationTurn(inbound.sender, inbound, replyText, employee?.id ?? null);

    return { status: "processed", sender: inbound.sender, replySent: sendResult.success };
  } catch (err) {
    return { status: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}
