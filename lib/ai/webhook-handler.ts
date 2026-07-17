import { createAdminClient } from "@/lib/supabase/admin";

import { AI_CONFIG } from "./config";
import { getWhatsAppConnector } from "./connectors/manager";
import { routeAdDrivenLead } from "./domains/ad-lead-routing";
import { sendWhatsAppText } from "./notifications/engine";
import { enqueueWhatsAppAiReplyJob } from "./queue/ai-job-queue";

export interface WhatsAppWebhookHandlerResult {
  status: "processed" | "queued" | "ignored" | "error" | "ad_lead_routed";
  sender?: string;
  replySent?: boolean;
  jobId?: string;
  reason?: string;
  /** TEMPORARY — ordered list of steps actually executed, for production tracing. Remove once the silent-non-reply bug is root-caused. */
  trace: string[];
}

/** Sent instead of a real answer only once Gemini has exhausted every retry attempt across the whole async job (see app/api/ai/process-job/route.ts) — never the raw error or a stack trace. Exported for the job processor's dead-letter path. */
export const AI_BUSY_FALLBACK_MESSAGE =
  "Maaf, layanan AI MK Connect sedang sibuk saat ini. Pesan Anda sudah kami terima — silakan coba lagi dalam beberapa menit.";

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

/** Exported for reuse by the job processor (app/api/ai/process-job/route.ts), which saves the turn once the queued AI reply is actually known. */
export async function saveAiConversationTurn(sender: string, inboundText: string, replyText: string | null, employeeId: string | null) {
  const supabase = createAdminClient();
  await supabase.from("ai_conversations").insert({
    connector: "whatsapp",
    sender,
    employee_id: employeeId,
    inbound_text: inboundText,
    reply_text: replyText,
  });
}

/**
 * The "receive one WhatsApp event" front half — normalize (via the
 * connector) -> resolve the sender to an employee if possible -> either
 * reply immediately (non-text messages, which never need Gemini) or enqueue
 * an async job (ai_job_queue) for text messages instead of calling Gemini
 * synchronously here. Enqueueing is what lets a slow/retrying Gemini call
 * never risk exceeding this function's own duration budget — the actual AI
 * call, reply, and conversation log happen in
 * app/api/ai/process-job/route.ts, dispatched by a DB trigger/pg_cron sweep
 * (migration 0065), independent of this webhook request's lifetime.
 */
export async function handleWhatsAppWebhookEvent(rawPayload: unknown): Promise<WhatsAppWebhookHandlerResult> {
  const trace: string[] = ["handler:entry"];

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

    if (inbound.adReferral) {
      // Ad-driven lead: never hand this to the AI reply pipeline -- the
      // operator already runs their own auto-reply on this WhatsApp number
      // (see lib/ai/domains/ad-lead-routing.ts's module doc). This only
      // gets the lead into prospects and notifies the assigned sales rep.
      trace.push(`adReferral:present(${inbound.adReferral.sourceId})`);
      const routed = await routeAdDrivenLead(inbound.sender, inbound.senderName, inbound.adReferral);
      trace.push(`routeAdDrivenLead:${routed.outcome}`);
      return { status: "ad_lead_routed", sender: inbound.sender, reason: routed.outcome, trace };
    }

    trace.push("findEmployeeByPhone:calling");
    const employee = await findEmployeeByPhone(inbound.sender);
    trace.push(employee ? "findEmployeeByPhone:matched" : "findEmployeeByPhone:no_match");

    if (!employee) {
      // Never let the internal AI assistant (HR/Markom/CRM/general prompts,
      // meant for employees) talk to an external number -- a customer's
      // follow-up message after clicking an ad (which carries no ad_reply
      // referral by then) would otherwise fall straight into this pipeline
      // and could easily read as tone-deaf or off-topic to them. Sales
      // stays the only one who talks to leads; WhatsApp Business's own
      // configured Auto Reply (outside this app) covers the canned
      // "terima kasih, sales kami akan segera menghubungi" greeting.
      trace.push("unrecognized_sender:ignored_no_ai_reply");
      await saveAiConversationTurn(inbound.sender, inbound.content.kind === "text" ? inbound.content.text : "[non-text message]", null, null);
      trace.push("saveAiConversationTurn:done");
      return { status: "ignored", sender: inbound.sender, reason: "sender is not a registered employee -- AI does not reply to customers", trace };
    }

    if (inbound.content.kind !== "text") {
      // Never needs Gemini -- answer immediately, no queue involved.
      const replyText = "Maaf, MK Connect AI saat ini hanya dapat memproses pesan teks.";
      trace.push("sendWhatsAppText:calling(non-text)");
      const sendResult = await sendWhatsAppText(inbound.sender, replyText);
      trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
      await saveAiConversationTurn(inbound.sender, inbound.content.text, replyText, employee?.id ?? null);
      trace.push("saveAiConversationTurn:done");
      return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
    }

    trace.push("enqueueWhatsAppAiReplyJob:calling");
    const job = await enqueueWhatsAppAiReplyJob(
      {
        sender: inbound.sender,
        contentText: inbound.content.text,
        employeeId: employee?.id ?? null,
        employeeName: employee?.full_name ?? null,
      },
      AI_CONFIG.retryMaxAttempts,
    );
    if (!job) {
      trace.push("enqueueWhatsAppAiReplyJob:failed");
      return { status: "error", reason: "failed to enqueue AI reply job", sender: inbound.sender, trace };
    }
    trace.push(`enqueueWhatsAppAiReplyJob:queued(${job.id})`);
    return { status: "queued", sender: inbound.sender, jobId: job.id, trace };
  } catch (err) {
    trace.push(`exception:${err instanceof Error ? err.message : String(err)}`);
    return { status: "error", reason: err instanceof Error ? err.message : String(err), trace };
  }
}
