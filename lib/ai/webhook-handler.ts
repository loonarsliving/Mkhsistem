import { createAdminClient } from "@/lib/supabase/admin";

import { AI_CONFIG } from "./config";
import { getWhatsAppConnector } from "./connectors/manager";
import {
  tryBulkReassignAdLeadFollowUp,
  tryConfirmAdLeadFollowUp,
  tryNotifySalesLeadWantsInfo,
  tryReassignAdLeadFollowUp,
} from "./domains/ad-lead-routing";
import { tryHandleApprovalDecision, tryHandleApprovalSubmission } from "./domains/approval-requests";
import { tryRouteConstructionPhotoReport } from "./domains/construction-report-routing";
import {
  hasNurtureEligibleLead,
  tryHandleSuperadminAnswer,
  tryHandleSuperadminImageAnswer,
  tryHandleUnmatchedAdLead,
} from "./domains/lead-nurture";
import { tryApproveLoonarsFeeViaWhatsApp } from "./domains/loonars-fee-approval";
import { formatRelayReply, hasOtherPendingPhotos, stagePendingPhoto, tryRelayToEmployees } from "./domains/message-relay";
import { tryTrackConstructionProgressPhoto } from "./domains/construction-progress-tracking";
import { tryAutoForwardPhoto } from "./domains/photo-auto-forward";
import { tryRecordConstructionFundTransferViaWhatsApp } from "./domains/construction-fund-transfer-confirmation";
import { tryConfirmTransferProofViaWhatsApp } from "./domains/transfer-proof-confirmation";
import { tryRejectPendingTransferViaWhatsApp } from "./domains/transfer-rejection";
import { sendWhatsAppImage, sendWhatsAppText } from "./notifications/engine";
import { enqueueAdminAnswerRelayJob, enqueueLeadNurtureReplyJob, enqueueWhatsAppAiReplyJob } from "./queue/ai-job-queue";

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
      // Ad-driven lead: the AI nurture bot (lib/ai/domains/lead-nurture.ts)
      // now talks to the lead directly, answering only from that project's
      // knowledge_base and tracking temperature across the conversation --
      // replacing the old "get into prospects + instantly notify a
      // round-robin Sales" behavior. Queued (not called synchronously) for
      // the same reason every other Gemini-backed WhatsApp reply in this
      // file is: a slow/retrying Gemini call must never risk this
      // function's own duration budget. The actual routing decision
      // (nurture vs. the legacy freelance/no-recipient fallback) happens
      // inside the job.
      trace.push(`adReferral:present(${inbound.adReferral.sourceId})`);
      const job = await enqueueLeadNurtureReplyJob(
        {
          sender: inbound.sender,
          senderName: inbound.senderName ?? null,
          contentText: inbound.content.kind === "text" ? inbound.content.text : "(klik iklan)",
          adReferralSourceId: inbound.adReferral.sourceId,
        },
        AI_CONFIG.retryMaxAttempts,
      );
      if (!job) {
        trace.push("enqueueLeadNurtureReplyJob:failed");
        return { status: "error", reason: "failed to enqueue lead nurture job", sender: inbound.sender, trace };
      }
      trace.push(`enqueueLeadNurtureReplyJob:queued(${job.id})`);
      return { status: "queued", sender: inbound.sender, jobId: job.id, trace };
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
      // Before giving up entirely: a follow-up text (no fresh ad_reply on
      // this particular message) from a number that already has an
      // ad-driven prospects row belongs to the nurture bot, same as a
      // fresh ad click -- it just continues the existing conversation
      // instead of opening a new one (see lib/ai/domains/lead-nurture.ts's
      // continueExistingLeadNurture). Only a lead with NO ad-driven
      // prospects row at all (e.g. sourced from another channel) falls
      // through to tryNotifySalesLeadWantsInfo's narrower keyword-based
      // safety net below.
      if (inbound.content.kind === "text") {
        trace.push("hasNurtureEligibleLead:calling");
        const nurtureEligible = await hasNurtureEligibleLead(inbound.sender);
        trace.push(`hasNurtureEligibleLead:${nurtureEligible}`);
        if (nurtureEligible) {
          trace.push("enqueueLeadNurtureReplyJob:calling(follow-up)");
          const job = await enqueueLeadNurtureReplyJob(
            { sender: inbound.sender, senderName: inbound.senderName ?? null, contentText: inbound.content.text, adReferralSourceId: null },
            AI_CONFIG.retryMaxAttempts,
          );
          if (job) {
            trace.push(`enqueueLeadNurtureReplyJob:queued(${job.id})`);
            return { status: "queued", sender: inbound.sender, jobId: job.id, trace };
          }
          trace.push("enqueueLeadNurtureReplyJob:failed");
        }

        trace.push("tryNotifySalesLeadWantsInfo:calling");
        const infoResult = await tryNotifySalesLeadWantsInfo(inbound.sender, inbound.senderName, inbound.content.text);
        trace.push(`tryNotifySalesLeadWantsInfo:${infoResult.outcome}`);
        if (infoResult.outcome === "notified") {
          await saveAiConversationTurn(inbound.sender, inbound.content.text, null, null);
          trace.push("saveAiConversationTurn:done");
          return { status: "lead_info_request_routed", sender: inbound.sender, reason: infoResult.outcome, trace };
        }

        // Last resort before giving up entirely: a first-contact stranger
        // whose ad click didn't carry usable ad_reply data (Whacenter can
        // send source_id/source_type/source_url all null even though
        // WhatsApp's own client shows "started from an ad" -- confirmed via
        // ai_integration_logs on a real incident). Ask which project they
        // meant instead of silently dropping them; see
        // tryHandleUnmatchedAdLead / pending_project_selections.
        trace.push("tryHandleUnmatchedAdLead:calling");
        const unmatchedResult = await tryHandleUnmatchedAdLead(inbound.sender, inbound.senderName, inbound.content.text);
        trace.push(`tryHandleUnmatchedAdLead:handled(${unmatchedResult.handled})${unmatchedResult.jobId ? `,queued(${unmatchedResult.jobId})` : ""}`);
        if (unmatchedResult.handled) {
          await saveAiConversationTurn(inbound.sender, inbound.content.text, null, null);
          trace.push("saveAiConversationTurn:done");
          return { status: unmatchedResult.jobId ? "queued" : "processed", sender: inbound.sender, jobId: unmatchedResult.jobId, trace };
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

      // Auto-route: a Kepala Cabang with an active construction project
      // (Kendari today) has every photo they send forwarded straight to
      // every Super Admin as a progress update -- no "kirim ke ..."
      // instruction needed. Runs unconditionally, independent of the
      // explicit relay-by-name check below.
      trace.push("getRoleKey:calling(image)");
      const imageRoleKey = await getRoleKey(employee.role_id);
      trace.push(`getRoleKey:${imageRoleKey ?? "null"}`);

      // Bukti transfer confirmation (0222): Super Admin sending a photo
      // after approving a gaji tukang / pembelian bahan pengajuan and
      // actually transferring the money. FIFO-picks the oldest pengajuan
      // still awaiting transfer proof, AI-reads the photo, posts jurnal in
      // mkh-properti, and forwards this same photo to Kepala Cabang + Endy
      // so they can pass it on to the tukang/toko. Short-circuits
      // everything else since a bukti transfer photo isn't a progress/relay
      // photo.
      if (imageRoleKey === "super_admin") {
        // Super Admin answering a nurture-bot escalation with a PHOTO --
        // "[PQ-0001]" or "[PQ-0001]: ini denahnya" as the caption (see
        // lib/ai/domains/lead-nurture.ts's tryHandleSuperadminImageAnswer).
        // Must run before the fund-transfer/bukti-transfer checks below --
        // "PQ-" never collides with a branch/Kepala Cabang name caption, but
        // running it first keeps that guarantee explicit.
        trace.push("tryHandleSuperadminImageAnswer:calling");
        const imageAnswerResult = await tryHandleSuperadminImageAnswer(inbound.content.caption, inbound.content.url);
        trace.push(`tryHandleSuperadminImageAnswer:${imageAnswerResult.outcome}`);
        if (imageAnswerResult.outcome !== "not_an_answer_command") {
          let replyText: string;
          if (imageAnswerResult.outcome === "answered" && imageAnswerResult.pendingQuestionId) {
            const relayJob = await enqueueAdminAnswerRelayJob({ pendingQuestionId: imageAnswerResult.pendingQuestionId }, AI_CONFIG.retryMaxAttempts);
            replyText = relayJob
              ? "✅ Gambar diterima, sedang diteruskan ke lead dan disimpan ke knowledge base."
              : "⚠️ Gambar tersimpan, tapi gagal menjadwalkan pengiriman ke lead. Tolong cek manual.";
          } else if (imageAnswerResult.outcome === "already_answered") {
            replyText = "Pertanyaan itu sudah dijawab sebelumnya.";
          } else {
            replyText = "Tidak ditemukan pertanyaan pending dengan kode itu. Cek lagi kodenya.";
          }
          trace.push("sendWhatsAppText:calling(pending-question-image-answer)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[gambar]", replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }

        // Construction project fund transfer (0225): caption mentions a
        // branch/project/Kepala Cabang name (e.g. "Kendari" or "Fasly") --
        // tops up that project's dana masuk instead of being treated as a
        // gaji-tukang/material expense transfer proof. Deliberately
        // caption-gated so it never hijacks the far more common expense
        // transfer proof below, which has no caption requirement.
        trace.push("tryRecordConstructionFundTransferViaWhatsApp:calling");
        const fundTransferResult = await tryRecordConstructionFundTransferViaWhatsApp(
          { id: employee.id, name: employee.full_name, roleKey: imageRoleKey },
          inbound.content.url,
          inbound.content.caption,
        );
        trace.push(`tryRecordConstructionFundTransferViaWhatsApp:${fundTransferResult.outcome}`);
        if (fundTransferResult.outcome === "recorded") {
          const recipientNames = fundTransferResult.recipients.map((r) => r.name);
          const replyText =
            `✅ Dana proyek *${fundTransferResult.projectName}* (${fundTransferResult.branchName}) bertambah Rp ${fundTransferResult.amount.toLocaleString("id-ID")} (dibaca dari foto).` +
            (recipientNames.length > 0 ? `\n📤 Bukti sudah diteruskan ke ${recipientNames.join(" & ")}.` : "\n⚠️ Tidak ada Kepala Cabang dengan nomor WA terdaftar untuk diteruskan otomatis.");
          trace.push("sendWhatsAppText:calling(fund-transfer)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          trace.push("sendWhatsAppImage:forwarding(fund-transfer)");
          for (const recipient of fundTransferResult.recipients) {
            await sendWhatsAppImage(recipient.phone, inbound.content.url, `📎 Bukti transfer dana proyek ${fundTransferResult.projectName} — Rp ${fundTransferResult.amount.toLocaleString("id-ID")} (dari Super Admin)`);
          }
          trace.push("sendWhatsAppImage:done(fund-transfer)");
          await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[bukti transfer dana proyek]", replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
        if (fundTransferResult.outcome === "ambiguous") {
          const replyText = `⚠️ Caption foto ini cocok dengan lebih dari satu proyek: ${fundTransferResult.candidates.join(", ")}. Tolong kirim ulang dengan caption yang lebih spesifik (nama proyek/cabang).`;
          trace.push("sendWhatsAppText:calling(fund-transfer-ambiguous)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[bukti transfer dana proyek]", replyText, employee.id);
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
        if (fundTransferResult.outcome === "unreadable") {
          const replyText = `⚠️ Foto untuk dana proyek *${fundTransferResult.projectName}* tidak bisa dibaca AI dengan jelas. Tolong kirim ulang foto bukti transfer yang lebih jelas.`;
          trace.push("sendWhatsAppText:calling(fund-transfer-unreadable)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[bukti transfer dana proyek]", replyText, employee.id);
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }

        trace.push("tryConfirmTransferProofViaWhatsApp:calling");
        const transferResult = await tryConfirmTransferProofViaWhatsApp({ id: employee.id, name: employee.full_name, roleKey: imageRoleKey }, inbound.content.url);
        trace.push(`tryConfirmTransferProofViaWhatsApp:${transferResult.outcome}`);
        if (transferResult.outcome === "confirmed") {
          const recipientNames = transferResult.recipients.map((r) => r.name);
          const mismatchNote =
            transferResult.mismatch && transferResult.ai.nominal !== null
              ? `\n⚠️ Perhatian: nominal di foto (Rp ${transferResult.ai.nominal.toLocaleString("id-ID")}) berbeda dari nominal pengajuan (Rp ${transferResult.nominal.toLocaleString("id-ID")}). Pastikan ini bukti transfer yang benar.`
              : "";
          const matchNote = transferResult.matchedByAmount ? " (dicocokkan otomatis dari nominal di foto)" : "";
          const replyText =
            `✅ Bukti transfer untuk ${transferResult.partyName ?? "pengajuan"} (Rp ${transferResult.nominal.toLocaleString("id-ID")}) diterima dan dicatat ke jurnal.${matchNote}` +
            mismatchNote +
            (recipientNames.length > 0 ? `\n📤 Bukti sudah diteruskan ke ${recipientNames.join(" & ")}.` : "\n⚠️ Tidak ada Kepala Cabang/Endy dengan nomor WA terdaftar untuk diteruskan otomatis.");
          trace.push("sendWhatsAppText:calling(transfer-confirm)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          trace.push("sendWhatsAppImage:forwarding");
          for (const recipient of transferResult.recipients) {
            await sendWhatsAppImage(recipient.phone, inbound.content.url, `📎 Bukti transfer ${transferResult.partyName ?? ""} — Rp ${transferResult.nominal.toLocaleString("id-ID")} (dari Super Admin, tolong teruskan ke pihak terkait)`);
          }
          trace.push("sendWhatsAppImage:done");
          await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[bukti transfer]", replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
        if (transferResult.outcome === "sync_failed") {
          const replyText = `⚠️ Bukti transfer diterima, tapi GAGAL dicatat ke jurnal (${transferResult.error}). Tolong kirim ulang fotonya -- belum ada yang tercatat, jadi aman diulang.`;
          trace.push("sendWhatsAppText:calling(transfer-sync-failed)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[bukti transfer]", replyText, employee.id);
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
        if (transferResult.outcome === "no_amount_match") {
          const candidateLines = transferResult.candidates
            .map((c) => `- ${c.partyName ?? "Pengajuan"}: Rp ${c.nominal.toLocaleString("id-ID")}`)
            .join("\n");
          const replyText =
            `⚠️ Nominal di foto (Rp ${transferResult.readNominal.toLocaleString("id-ID")}) tidak cocok dengan pengajuan manapun yang sedang pending, jadi belum saya catat ke jurnal supaya tidak salah tempel.\n\n` +
            `Pengajuan yang masih menunggu:\n${candidateLines}\n\n` +
            `Kalau foto ini memang bukti transfer untuk salah satunya, balas dengan sebutkan pengajuannya. Kalau foto ini bukan bukti transfer (mis. struk lain yang salah kirim), abaikan saja.`;
          trace.push("sendWhatsAppText:calling(transfer-no-amount-match)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[bukti transfer]", replyText, employee.id);
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
        if (transferResult.outcome === "no_pending_transfer") {
          // Deliberately doesn't short-circuit -- Super Admin's photo might
          // not have been a bukti transfer at all (the generic photo-relay
          // flow below still applies), but sending only that generic "Foto
          // diterima..." prompt when there genuinely was nothing pending
          // reads as a silent failure. Say so explicitly, then let the
          // request keep falling through to the relay flow as before.
          trace.push("sendWhatsAppText:calling(transfer-no-pending)");
          await sendWhatsAppText(
            inbound.sender,
            "ℹ️ Tidak ada pengajuan gaji tukang/pembelian bahan yang sedang menunggu bukti transfer saat ini. Kalau foto ini memang bukti transfer, cek dulu apakah pengajuannya sudah disetujui Kepala Cabang.",
          );
        }
      }

      // Approval requests (0201): "AJUKAN ..." in the caption, from a Kepala
      // Cabang, is a submission (pricelist photo, anything) -- short-circuits
      // everything else below, since this photo's purpose is the approval
      // request itself, not a progress/relay photo.
      if (imageRoleKey === "kepala_cabang") {
        trace.push("tryHandleApprovalSubmission:calling(image)");
        const approvalSubmit = await tryHandleApprovalSubmission(
          { id: employee.id, full_name: employee.full_name, branch_id: employee.branch_id },
          inbound.content.caption,
          inbound.content.url,
        );
        trace.push(`tryHandleApprovalSubmission:${approvalSubmit.outcome}`);
        if (approvalSubmit.outcome === "submitted") {
          const replyText = `📋 Pengajuan *${approvalSubmit.code}* terkirim ke Super Admin. Anda akan diberi tahu WA begitu sudah diputuskan.`;
          trace.push("sendWhatsAppText:calling(approval-submit-image)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[image]", replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
      }

      trace.push("tryRouteConstructionPhotoReport:calling");
      const constructionRoute = await tryRouteConstructionPhotoReport(
        { id: employee.id, full_name: employee.full_name, branch_id: employee.branch_id, role_key: imageRoleKey },
        inbound.content.url,
        inbound.content.caption,
      );
      trace.push(`tryRouteConstructionPhotoReport:${constructionRoute.outcome}`);

      // Table-driven auto-forward (0197) -- e.g. Endy's material-purchase
      // photos to Vando + every Super Admin. Independent of the
      // construction route above (different table, different senders).
      trace.push("tryAutoForwardPhoto:calling");
      const autoForward = await tryAutoForwardPhoto({ id: employee.id, full_name: employee.full_name }, inbound.content.url, inbound.content.caption);
      trace.push(`tryAutoForwardPhoto:${autoForward.outcome}`);

      // Endy's progress tracking (0199) -- vision-assesses the photo against
      // its captioned block code for the Saturday 13:00 report. Runs
      // independently of the forwarding above (different concern: is this
      // block's payroll assessment data, not who receives the photo).
      trace.push("tryTrackConstructionProgressPhoto:calling");
      const progressTrack = await tryTrackConstructionProgressPhoto({ id: employee.id, full_name: employee.full_name }, inbound.content.url, inbound.content.caption);
      trace.push(`tryTrackConstructionProgressPhoto:${progressTrack.outcome}`);

      if (inbound.content.caption) {
        trace.push("tryRelayToEmployees:calling(image)");
        const relayResult = await tryRelayToEmployees({ id: employee.id, name: employee.full_name }, inbound.sender, inbound.content.caption);
        trace.push(`tryRelayToEmployees:${relayResult.outcome}`);
        if (relayResult.outcome !== "not_a_relay_request") {
          let replyText = formatRelayReply(relayResult);
          if (constructionRoute.outcome === "routed") {
            replyText += "\n\n✅ Foto ini juga otomatis dikirim ke Super Admin sebagai update progress pembangunan.";
          }
          if (autoForward.outcome === "routed") {
            replyText += `\n\n✅ Foto ini juga otomatis diteruskan ke ${autoForward.recipientNames.join(" & ")}.`;
          }
          trace.push("sendWhatsAppText:calling(image-relay)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.caption, replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
      }

      // Endy's progress-tracking reply always fires per photo (block
      // correlation matters per photo, unlike the generic relay reminder
      // below which only prompts once per batch) -- either confirms the AI
      // assessment or asks which block this photo belongs to. No-op
      // (outcome "not_applicable") for every other sender.
      if (progressTrack.outcome !== "not_applicable") {
        const replyText =
          progressTrack.outcome === "block_unknown"
            ? "📋 Foto ini untuk blok yang mana? Balas dengan kode bloknya di keterangan foto (A1-A5, B1-B4, C1-C4), sertakan juga rencana kerja besok dan bahan yang dibutuhkan, supaya progresnya bisa dicatat untuk laporan Sabtu dan jadi dasar pengajuan belanja besok pagi."
            : progressTrack.outcome === "daily_limit_reached"
              ? `📷 Foto blok ${progressTrack.blockCode} diterima${autoForward.outcome === "routed" ? ` dan diteruskan ke ${autoForward.recipientNames.join(" & ")}` : ""}. Batas 3 foto progres untuk blok ini hari ini sudah tercapai, jadi foto ini tidak dicatat lagi untuk laporan progres.`
              : progressTrack.outcome === "tracked"
                ? `✅ Foto blok ${progressTrack.blockCode} diterima${autoForward.outcome === "routed" ? ` dan diteruskan ke ${autoForward.recipientNames.join(" & ")}` : ""}. Progres tercatat: ${progressTrack.stage} (~${progressTrack.progressPct}%).${
                    progressTrack.plannedWorkTomorrow || progressTrack.materialsNeededTomorrow
                      ? `\n📌 Rencana besok: ${progressTrack.plannedWorkTomorrow ?? "-"}\n🧱 Bahan dibutuhkan: ${progressTrack.materialsNeededTomorrow ?? "-"}`
                      : "\n(Belum ada rencana kerja/bahan besok yang tercatat dari keterangan foto ini.)"
                  }`
                : `✅ Foto blok ${progressTrack.blockCode} diterima${autoForward.outcome === "routed" ? ` dan diteruskan ke ${autoForward.recipientNames.join(" & ")}` : ""}, tapi penilaian progres otomatis gagal -- tetap masuk laporan dengan catatan foto saja.`;
        trace.push("sendWhatsAppText:calling(image-progress-track)");
        const sendResult = await sendWhatsAppText(inbound.sender, replyText);
        trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
        await saveAiConversationTurn(inbound.sender, inbound.content.caption ?? "[image]", replyText, employee.id);
        trace.push("saveAiConversationTurn:done");
        return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
      }

      // No caption, or caption wasn't a relay instruction -- only prompt
      // once per batch (not on every single photo) so sending several
      // photos in a row doesn't spam the same reminder each time.
      if (!alreadyHasPending) {
        const replyText =
          constructionRoute.outcome === "routed"
            ? "✅ Foto diterima dan sudah dikirim ke Super Admin sebagai update progress pembangunan."
            : autoForward.outcome === "routed"
              ? `✅ Foto diterima dan sudah otomatis diteruskan ke ${autoForward.recipientNames.join(" & ")}.`
              : 'Foto diterima. Kalau ingin saya teruskan ke seseorang, kirim foto lain (kalau ada) lalu ketik/tulis di keterangan siapa penerimanya (mis. "untuk Vando").';
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
        // Super Admin answering a nurture-bot escalation, "[PQ-0001]:
        // jawaban" (see lib/ai/domains/lead-nurture.ts's
        // notifySuperadminsPendingQuestion). Must run first in this block
        // -- "PQ-" is distinctive enough it never collides with the
        // "ya"/"setuju" fee-approval or approval-decision checks below, but
        // running it first keeps that guarantee explicit rather than
        // incidental. The DB writes (mark answered + bank into
        // knowledge_base) happen synchronously here; the Gemini rephrase +
        // actual send-to-lead is queued (whatsapp_admin_answer_relay) so it
        // can't blow this webhook's duration budget.
        trace.push("tryHandleSuperadminAnswer:calling");
        const answerResult = await tryHandleSuperadminAnswer(inbound.content.text);
        trace.push(`tryHandleSuperadminAnswer:${answerResult.outcome}`);
        if (answerResult.outcome !== "not_an_answer_command") {
          let replyText: string;
          if (answerResult.outcome === "answered" && answerResult.pendingQuestionId) {
            const relayJob = await enqueueAdminAnswerRelayJob({ pendingQuestionId: answerResult.pendingQuestionId }, AI_CONFIG.retryMaxAttempts);
            replyText = relayJob
              ? "✅ Jawaban diterima, sedang diteruskan ke lead dan disimpan ke knowledge base."
              : "⚠️ Jawaban tersimpan, tapi gagal menjadwalkan pengiriman ke lead. Tolong cek manual.";
          } else if (answerResult.outcome === "already_answered") {
            replyText = "Pertanyaan itu sudah dijawab sebelumnya.";
          } else {
            replyText = "Tidak ditemukan pertanyaan pending dengan kode itu. Cek lagi kodenya.";
          }
          trace.push("sendWhatsAppText:calling(pending-question-answer)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.text, replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }

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

        // Reject an approved-but-unpaid pengajuan (0234): "TOLAK <KK-kode>
        // <alasan>", replied instead of a bukti transfer photo. Requires the
        // literal KK-code, so it never collides with approval_requests'
        // bare "TOLAK"/"TOLAK <AP-code>" pattern below.
        trace.push("tryRejectPendingTransferViaWhatsApp:calling");
        const rejectResult = await tryRejectPendingTransferViaWhatsApp({ id: employee.id, name: employee.full_name, roleKey }, inbound.content.text);
        trace.push(`tryRejectPendingTransferViaWhatsApp:${rejectResult.outcome}`);
        if (rejectResult.outcome !== "not_a_rejection") {
          let replyText: string;
          if (rejectResult.outcome === "rejected") {
            const recipientNames = rejectResult.recipients.map((r) => r.name);
            replyText =
              `❌ Pengajuan ${rejectResult.code} (${rejectResult.partyName ?? "-"}, Rp ${rejectResult.nominal.toLocaleString("id-ID")}) dibatalkan.` +
              (rejectResult.reason ? `\n📝 Alasan: ${rejectResult.reason}` : "") +
              (recipientNames.length > 0
                ? `\n📤 Sudah diteruskan ke ${recipientNames.join(" & ")} supaya bisa diperbaiki dan diajukan ulang.`
                : "\n⚠️ Tidak ada Kepala Cabang/pengaju dengan nomor WA terdaftar untuk diteruskan otomatis.");
          } else if (rejectResult.outcome === "sync_failed") {
            replyText = `⚠️ Penolakan diterima, tapi GAGAL disinkronkan (${rejectResult.error}). Coba lagi -- belum ada perubahan status.`;
          } else if (rejectResult.outcome === "not_super_admin") {
            replyText = "Hanya Super Admin yang bisa menolak pengajuan lewat WhatsApp.";
          } else {
            replyText = `Tidak ditemukan pengajuan pending dengan kode ${rejectResult.code}. Cek lagi kodenya.`;
          }
          trace.push("sendWhatsAppText:calling(transfer-reject)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          if (rejectResult.outcome === "rejected") {
            trace.push("sendWhatsAppText:forwarding(transfer-reject)");
            const forwardText =
              `❌ Pengajuan ${rejectResult.code} (${rejectResult.partyName ?? "-"}, Rp ${rejectResult.nominal.toLocaleString("id-ID")}) DIBATALKAN oleh Super Admin.` +
              (rejectResult.reason ? `\n📝 Alasan: ${rejectResult.reason}` : "") +
              `\n\nTolong perbaiki dan ajukan ulang.`;
            for (const recipient of rejectResult.recipients) {
              await sendWhatsAppText(recipient.phone, forwardText);
            }
            trace.push("sendWhatsAppText:done(transfer-reject)");
          }
          await saveAiConversationTurn(inbound.sender, inbound.content.text, replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }

        // Approval requests (0201): Super Admin deciding a pending request
        // by replying "SETUJU"/"TOLAK" (optionally with the code). Must run
        // after the fee-approval check above for the same "ya"/"setuju"
        // ambiguity reason -- only short-circuits on a real match.
        trace.push("tryHandleApprovalDecision:calling");
        const approvalDecision = await tryHandleApprovalDecision({ id: employee.id, full_name: employee.full_name }, inbound.content.text);
        trace.push(`tryHandleApprovalDecision:${approvalDecision.outcome}`);
        if (approvalDecision.outcome !== "not_a_decision") {
          const replyText =
            approvalDecision.outcome === "decided"
              ? `✅ Pengajuan ${approvalDecision.code} sudah ${approvalDecision.approved ? "disetujui" : "ditolak"}. Pemohon sudah diberi tahu via WA.`
              : approvalDecision.outcome === "ambiguous"
                ? "Ada lebih dari satu pengajuan yang masih pending. Sebutkan kodenya, mis. \"SETUJU AP-0003\"."
                : approvalDecision.outcome === "already_decided"
                  ? `Pengajuan ${approvalDecision.code} sudah diputuskan sebelumnya.`
                  : "Tidak ada pengajuan approval dengan kode itu, atau tidak ada yang sedang pending saat ini.";
          trace.push("sendWhatsAppText:calling(approval-decision)");
          const sendResult = await sendWhatsAppText(inbound.sender, replyText);
          trace.push(sendResult.success ? "sendWhatsAppText:success" : `sendWhatsAppText:failed(${sendResult.error ?? "unknown"})`);
          await saveAiConversationTurn(inbound.sender, inbound.content.text, replyText, employee.id);
          trace.push("saveAiConversationTurn:done");
          return { status: "processed", sender: inbound.sender, replySent: sendResult.success, trace };
        }
      }

      // Approval requests (0201): Kepala Cabang submitting "AJUKAN ..." as
      // plain text (no photo). Must run before the bulk-reassign/reassign
      // "lempar" checks below since both are role-gated the same way, but
      // "ajukan" never collides with "lempar".
      if (roleKey === "kepala_cabang") {
        trace.push("tryHandleApprovalSubmission:calling(text)");
        const approvalSubmit = await tryHandleApprovalSubmission(
          { id: employee.id, full_name: employee.full_name, branch_id: employee.branch_id },
          inbound.content.text,
          undefined,
        );
        trace.push(`tryHandleApprovalSubmission:${approvalSubmit.outcome}`);
        if (approvalSubmit.outcome === "submitted") {
          const replyText = `📋 Pengajuan *${approvalSubmit.code}* terkirim ke Super Admin. Anda akan diberi tahu WA begitu sudah diputuskan.`;
          trace.push("sendWhatsAppText:calling(approval-submit-text)");
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
