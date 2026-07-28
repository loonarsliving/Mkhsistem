import { createAdminClient } from "@/lib/supabase/admin";

import { AI_CONFIG } from "./config";
import { getWhatsAppConnector } from "./connectors/manager";
import {
  routeAdDrivenLead,
  tryBulkReassignAdLeadFollowUp,
  tryConfirmAdLeadFollowUp,
  tryNotifySalesLeadWantsInfo,
  tryReassignAdLeadFollowUp,
} from "./domains/ad-lead-routing";
import { tryApproveLoonarsFeeViaWhatsApp } from "./domains/loonars-fee-approval";
import { formatRelayReply, hasOtherPendingPhotos, stagePendingPhoto, tryRelayToEmployees } from "./domains/message-relay";
import { sendWhatsAppText } from "./notifications/engine";
import { enqueueWhatsAppAiReplyJob } from "./queue/ai-job-queue";

export interface WhatsAppWebhookHandlerResult {
  status: "processed" | "queued" | "ignored" | "error" | "ad_lead_routed" | "lead_info_request_routed";
  sender?: string;
  replySent?: boolean;
  jobId?: string;
  reason?: string;
  /** TEMPORARY — ordered list of steps actually executed, for production tracing. Remove once the silent-non-reply bug is root-caused. */
  trace: string[];
}

/** Sent instead of a real answer only once Gemini has exhausted every retry attempt across the whole async job (see app/api/ai/process-job/route.ts) — never the raw error or a stack trace. Exported for the job processor's dead-letter path. */
export const AI_BUSY_FALLBACK_MESSAGE =
  "Maaf, LEON sedang sibuk saat ini. Pesan Anda sudah kami terima — silakan coba lagi dalam beberapa menit.";

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
      //
      // Before giving up entirely: a known lead (already has a prospects
      // row) asking for info/presentasi is a real signal that shouldn't be
      // dropped just because this particular message carries no fresh
      // ad_reply referral -- hand it to their assigned Sales instead of
      // silently ignoring it (see tryNotifySalesLeadWantsInfo's doc).
      if (inbound.content.kind === "text") {
        trace.push("tryNotifySalesLeadWantsInfo:calling");
        const infoResult = await tryNotifySalesLeadWantsInfo(inbound.sender, inbound.senderName, inbound.content.text);
        trace.push(`tryNotifySalesLeadWantsInfo:${infoResult.outcome}`);
        if (infoResult.outcome === "notified") {
          await saveAiConversationTurn(inbound.sender, inbound.content.text, null, null);
          trace.push("saveAiConversationTurn:done");
          return { status: "lead_info_request_routed", sender: inbound.sender, reason: infoResult.outcome, trace };
        }
      }

      trace.push("unrecognized_sender:ignored_no_ai_reply");
      await saveAiConversationTurn(inbound.sender, inbound.content.kind === "text" ? inbound.content.text : "[non-text message]", null, null);
      trace.push("saveAiConversationTurn:done");
      return { status: "ignored", sender: inbound.sender, reason: "sender is not a registered employee -- AI does not reply to customers", trace };
    }

    if (inbound.content.kind === "image") {
      // "Kirim bukti transfer ini ke X" -- forwards the real photo(s), not
      // just text (see message-relay.ts). Always staged first (regardless
      // of caption) so 2+ photos sent in a row can later be relayed
      // together as one batch, whether the recipient is named on the last
      // photo's caption or in a separate follow-up text message.
      trace.push("stagePendingPhoto:calling");
      const alreadyHasPending = await hasOtherPendingPhotos(inbound.sender);
      await stagePendingPhoto(inbound.sender, employee.id, inbound.content.url, inbound.content.caption);
      trace.push("stagePendingPhoto:done");

      if (inbound.content.caption) {
        trace.push("tryRelayToEmployees:calling(image)");
        const relayResult = await tryRelayToEmployees({ id: employee.id, name: employee.full_name }, inbound.sender, inbound.content.caption);
        trace.push(`tryRelayToEmployees:${relayResult.outcome}`);
        if (relayResult.outcome !== "not_a_relay_request") {
          const replyText = formatRelayReply(relayResult);
          trace.push("sendWhatsAppText:calling(image-relay)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.caption, replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
      }

      // No caption, or caption wasn't a relay instruction -- only prompt
      // once per batch (not on every single photo) so sending several
      // photos in a row doesn't spam the same reminder each time.
      if (!alreadyHasPending) {
        const replyText = 'Foto diterima. Kalau ingin saya teruskan ke seseorang, kirim foto lain (kalau ada) lalu ketik/tulis di keterangan siapa penerimanya (mis. "untuk Vando").';
        trace.push("sendWhatsAppText:calling(image-no-caption)");
        const sendResult = await sendWhatsAppText(inbound.sender, replyText);
        trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
        await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[image]", replyText, employee.id);
        trace.push("saveAiConversationTurn:done");
        return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
      }
      trace.push("image_batched:no_reply");
      return { status: "processed", sender: inbound.sender, replySent: false, trace };
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

      // TEMPORARY: Super Admin approving a loonars fee claim by replying
      // "ya"/"setuju" instead of using MKH Property's /verifikasi.html CFO
      // page (see lib/ai/domains/loonars-fee-approval.ts). Must run before
      // the general AI pipeline; only short-circuits when a fee is actually
      // pending, so it never hijacks an unrelated "ya" reply.
      if (roleKey === "super_admin") {
        trace.push("tryApproveLoonarsFeeViaWhatsApp:calling");
        const feeApprovalResult = await tryApproveLoonarsFeeViaWhatsApp(employee.id, employee.full_name, inbound.content.text);
        trace.push(`tryApproveLoonarsFeeViaWhatsApp:${feeApprovalResult.outcome}`);
        if (feeApprovalResult.outcome === "approved") {
          const replyText = `✅ Fee unit ${feeApprovalResult.unit ?? "-"} (${feeApprovalResult.buyer ?? "-"}) disetujui via WhatsApp.\n💰 Nilai fee: Rp ${(feeApprovalResult.feeAmount ?? 0).toLocaleString("id-ID")}`;
          trace.push("sendWhatsAppText:calling(fee-approval)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.text, replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
      }

      if (roleKey === "kepala_cabang" && employee.branch_id) {
        // "LEMPAR SEMUA <nama sales>" -- bulk-reassigns every unfollowed lead
        // belonging to one sales rep at once (crm_run_sales_conduct_monitoring,
        // 0120, sends this exact instruction when a sales rep has 5+ leads
        // sitting untouched for 2+ hours). Must run before the single-lead
        // "LEMPAR <digit>" check below since both share the "lempar" keyword.
        trace.push("tryBulkReassignAdLeadFollowUp:calling");
        const bulkReassignResult = await tryBulkReassignAdLeadFollowUp(employee.id, employee.branch_id, inbound.content.text);
        trace.push(`tryBulkReassignAdLeadFollowUp:${bulkReassignResult.outcome}`);
        if (bulkReassignResult.outcome !== "not_a_bulk_reassign_command") {
          const replyText =
            bulkReassignResult.outcome === "reassigned"
              ? `✅ ${bulkReassignResult.reassignedCount} lead dari ${bulkReassignResult.sourceSalesName ?? "sales tersebut"} sudah dialihkan ke sales lain di cabang Anda.`
              : bulkReassignResult.outcome === "sales_not_found"
                ? "Nama sales itu tidak ditemukan di cabang Anda. Cek lagi ejaannya."
                : bulkReassignResult.outcome === "sales_ambiguous"
                  ? `Ada lebih dari satu sales yang cocok: ${bulkReassignResult.candidateNames?.join(", ")} -- sebutkan nama lengkap.`
                  : bulkReassignResult.outcome === "no_leads_to_reassign"
                    ? `${bulkReassignResult.sourceSalesName ?? "Sales itu"} tidak punya lead yang belum di-follow up saat ini.`
                    : "Tidak ada Sales lain yang aktif di cabang Anda untuk menerima lead-lead ini.";
          trace.push("sendWhatsAppText:calling(bulk-reassign)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.text, replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }

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
      // reachable for "raw" now ("image" always returns above) --
      // unrecognized content the connector couldn't parse into text or image.
      const replyText = "Maaf, LEON saat ini hanya dapat memproses pesan teks.";
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
