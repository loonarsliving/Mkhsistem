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
  /** TEMPORARY — ordered list of steps actually executed, for production tracing. Remove once the silent-non-reply bug is root-caused. */
  trace: string[];
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
  const trace: string[] = ["handler:entry"];

  // TEMPORARY: the entire body is now one try/catch (previously only the
  // AI-routing/reply/save section was wrapped) -- connector.receiveWebhook()
  // calls saveIntegrationLog() -> createAdminClient(), which THROWS if
  // NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing
  // (lib/supabase/admin.ts:17-19). That call was previously outside any
  // try/catch in this function, so such a throw discarded the whole trace
  // and surfaced only as route.ts's generic "handleWhatsAppWebhookEvent:threw"
  // -- exactly the kind of blind spot that made "where did it stop" unprovable.
  try {
    const connector = getWhatsAppConnector();
    trace.push(connector ? "getWhatsAppConnector:configured" : "getWhatsAppConnector:null");
    if (!connector) {
      return { status: "ignored", reason: "WhatsApp connector not configured", trace };
    }

    trace.push("connector.receiveWebhook:calling");
    const received = await connector.receiveWebhook(rawPayload);
    trace.push(received.accepted ? "connector.receiveWebhook:accepted" : "connector.receiveWebhook:rejected");
    if (!received.accepted || !received.normalized) {
      return { status: "ignored", reason: received.reason, trace };
    }

    const inbound = received.normalized;
    trace.push(`normalized.content.kind:${inbound.content.kind}`);

    trace.push("findEmployeeByPhone:calling");
    const employee = await findEmployeeByPhone(inbound.sender);
    trace.push(employee ? "findEmployeeByPhone:matched" : "findEmployeeByPhone:no_match");

    const question = inbound.content.kind === "text" ? inbound.content.text : "";

    trace.push("routeAndAnswer:calling");
    const replyText = question
      ? await routeAndAnswer(question, employee ? { id: employee.id, name: employee.full_name } : null)
      : "Maaf, MK Connect AI saat ini hanya dapat memproses pesan teks.";
    trace.push("routeAndAnswer:returned");

    trace.push("sendWhatsAppText:calling");
    const sendResult = await sendWhatsAppText(inbound.sender, replyText);
    trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);

    trace.push("saveConversationTurn:calling");
    await saveConversationTurn(inbound.sender, inbound, replyText, employee?.id ?? null);
    trace.push("saveConversationTurn:done");

    return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
  } catch (err) {
    trace.push(`exception:${err instanceof Error ? err.message : String(err)}`);
    return { status: "error", reason: err instanceof Error ? err.message : String(err), trace };
  }
}
