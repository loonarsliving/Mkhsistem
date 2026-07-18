import { createAdminClient } from "@/lib/supabase/admin";

import { AI_CONFIG } from "./config";
import { getWhatsAppConnector } from "./connectors/manager";
import { routeAdDrivenLead, tryConfirmAdLeadFollowUp, tryReassignAdLeadFollowUp } from "./domains/ad-lead-routing";
import { tryRelayImageToEmployee } from "./domains/message-relay";
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

  const { data } = await supabase.from("employees").select("id, full_name, phone, role_id, branch_id").not("phone", "is", null);
  return (data ?? []).find((employee) => digitsOnly(employee.phone ?? "").endsWith(suffix)) ?? null;
}

/** Only used to gate the Kepala Cabang lead-reassign WhatsApp command (tryReassignAdLeadFollowUp) -- everyone else's role is irrelevant to the webhook flow. */
async function getRoleKey(roleId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("roles").select("key").eq("id", roleId).maybeSingle();
  return data?.key ?? null;
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

    if (inbound.content.kind === "image") {
      // "Kirim bukti transfer ini ke X" -- forwards the actual image, not
      // just text (see message-relay.ts's tryRelayImageToEmployee). Falls
      // through to the generic "can't process" reply below if there's no
      // caption or the caption isn't a relay instruction -- an unrelated
      // photo (e.g. a screenshot someone sends just to ask about) still
      // shouldn't get a made-up "sudah diteruskan" response.
      trace.push("tryRelayImageToEmployee:calling");
      const imageRelayResult = await tryRelayImageToEmployee({ id: employee.id, name: employee.full_name }, inbound.content.caption, inbound.content.url);
      trace.push(`tryRelayImageToEmployee:${imageRelayResult.outcome}`);
      if (imageRelayResult.outcome !== "not_a_relay_request") {
        const replyText =
          imageRelayResult.outcome === "relayed"
            ? `✅ Foto sudah diteruskan ke ${imageRelayResult.recipientName} via WhatsApp.`
            : imageRelayResult.outcome === "recipient_not_found"
              ? "Maaf, saya tidak menemukan karyawan aktif yang cocok dengan penerima yang dimaksud. Mohon cek lagi nama/jabatannya di keterangan foto."
              : imageRelayResult.outcome === "recipient_ambiguous"
                ? `Ada lebih dari satu karyawan yang cocok: ${imageRelayResult.candidateNames?.join(", ")}. Mohon sebutkan nama lengkap yang lebih spesifik.`
                : `Maaf, saya menemukan ${imageRelayResult.recipientName} tapi foto gagal terkirim ke nomornya. Mohon kirim langsung.`;
        trace.push("sendWhatsAppText:calling(image-relay)");
        const sendResult = await sendWhatsAppText(inbound.sender, replyText);
        trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
        await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[image]", replyText, employee.id);
        trace.push("saveAiConversationTurn:done");
        return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
      }
    }

    if (inbound.content.kind === "text") {
      // Kepala Cabang reassigning a lead escalated to them after 3 unanswered
      // Sales reminders (0110_ad_lead_3x_daily_reminder_and_reassign.sql).
      // Gated on role so a stray "lempar <digits>" from anyone else never
      // moves a lead. Must run before the general AI pipeline for the same
      // reason as the confirm block below.
      trace.push("getRoleKey:calling");
      const roleKey = await getRoleKey(employee.role_id);
      trace.push(`getRoleKey:${roleKey ?? "null"}`);
      if (roleKey === "kepala_cabang" && employee.branch_id) {
        trace.push("tryReassignAdLeadFollowUp:calling");
        const reassignResult = await tryReassignAdLeadFollowUp(employee.id, employee.branch_id, inbound.content.text);
        trace.push(`tryReassignAdLeadFollowUp:${reassignResult.outcome}`);
        if (reassignResult.outcome !== "not_a_reassign_command") {
          const replyText =
            reassignResult.outcome === "reassigned"
              ? `✅ Lead ${reassignResult.customerName ?? "ini"} sudah dialihkan dari ${reassignResult.previousSalesName ?? "sales sebelumnya"} ke ${reassignResult.newSalesName ?? "sales lain"}.`
              : reassignResult.outcome === "ambiguous"
                ? "Ada lebih dari satu lead di cabang Anda yang cocok dengan nomor itu. Sebutkan digit yang lebih lengkap, atau alihkan manual di Menu Prospek."
                : reassignResult.outcome === "no_other_sales"
                  ? "Tidak ada Sales lain yang aktif di cabang Anda untuk menerima lead ini. Silakan alihkan manual di Menu Prospek."
                  : "Nomor itu tidak cocok dengan lead yang sedang menunggu di cabang Anda (mungkin sudah di-follow up). Cek lagi digitnya, atau lihat di Menu Prospek.";
          trace.push("sendWhatsAppText:calling(reassign)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.text, replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
      }

      // Sales confirming an ad-lead follow-up reminder just by mentioning
      // the customer's phone digits (0104_ad_lead_followup_monitoring.sql).
      // Deterministic match, never needs Gemini, and must run before the
      // general AI pipeline so it doesn't get answered as a stray question
      // instead of acted on.
      trace.push("tryConfirmAdLeadFollowUp:calling");
      const confirmResult = await tryConfirmAdLeadFollowUp(employee.id, inbound.content.text);
      trace.push(`tryConfirmAdLeadFollowUp:${confirmResult.outcome}`);
      if (confirmResult.outcome !== "not_a_confirm_command") {
        const replyText =
          confirmResult.outcome === "confirmed"
            ? `✅ Follow up untuk ${confirmResult.customerName ?? "lead ini"} sudah tercatat. Reminder untuk lead ini berhenti.`
            : confirmResult.outcome === "ambiguous"
              ? "Ada lebih dari satu lead Anda yang cocok dengan nomor itu. Sebutkan digit yang lebih lengkap, atau input manual di Menu Prospek."
              : "Nomor itu tidak cocok dengan lead Anda yang belum di-follow up (mungkin sudah tercatat sebelumnya). Cek lagi digitnya, atau lihat di Menu Prospek.";
        trace.push("sendWhatsAppText:calling(followup-confirm)");
        const sendResult = await sendWhatsAppText(inbound.sender, replyText);
        trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
        await saveAiConversationTurn(inbound.sender, inbound.content.text, replyText, employee.id);
        trace.push("saveAiConversationTurn:done");
        return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
      }
    }

    if (inbound.content.kind !== "text") {
      // Never needs Gemini -- answer immediately, no queue involved. Only
      // reachable for "image" when it wasn't a relay instruction (handled
      // above) and for "raw" (unrecognized content the connector couldn't
      // parse into text or image).
      const replyText =
        inbound.content.kind === "image"
          ? "Foto diterima. Kalau ingin saya teruskan ke seseorang, sertakan nama/jabatan penerimanya di keterangan foto (mis. \"untuk Vando\")."
          : "Maaf, MK Connect AI saat ini hanya dapat memproses pesan teks.";
      const inboundLogText = inbound.content.kind === "image" ? (inbound.content.caption ?? "[image]") : inbound.content.text;
      trace.push("sendWhatsAppText:calling(non-text)");
      const sendResult = await sendWhatsAppText(inbound.sender, replyText);
      trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
      await saveAiConversationTurn(inbound.sender, inboundLogText, replyText, employee?.id ?? null);
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
