import "server-only";

import { normalizeIndonesianPhone } from "@/features/messaging/schemas/messaging.schema";
import { sendWhatsAppDocument, sendWhatsAppImage, sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import { createWaMediaUrl } from "@/lib/wa-media/link";
import { createAdminClient } from "@/lib/supabase/admin";

import { buildRefundProofCustomerMessage, findNextUnpaidTermin, formatRefundMonthLong } from "./transfer-proof-format";

export const REFUND_PROOF_BUCKET = "refund-transfer-proofs";

/** Long enough for WhatsApp (Whacenter) to fetch the file once; the link is never shown to anyone. */
const FORWARD_URL_TTL_SECONDS = 60 * 60;

export interface ProcessRefundProofInput {
  customerId: string;
  /** Explicit termin (dashboard). */
  installmentId?: string | null;
  /** Termin month from a WA caption; year optional (nearest unpaid termin with that month wins). */
  month?: number;
  year?: number;
  storagePath: string;
  contentType: string;
  source: "whatsapp" | "dashboard";
  actorEmployeeId: string;
}

export type ProcessRefundProofResult =
  | {
      ok: true;
      customerName: string;
      customerPhone: string | null;
      installment: { dueMonth: string; amount: number } | null;
      nextInstallment: { dueMonth: string; amount: number } | null;
      paidAmount: number;
      remainingAmount: number;
      forwarded: boolean;
      forwardError: string | null;
    }
  | { ok: false; error: string };

/**
 * Shared by the WhatsApp ("REFUND <nama>" + photo) and dashboard ("Upload
 * Bukti") entry points (0289). Callers check the sender/permission first;
 * this runs with the service role. Owner's call: everything is automatic --
 * tick the termin, store the proof, forward it to the customer, record it
 * in the customer's chat.
 */
export async function processRefundTransferProof(input: ProcessRefundProofInput): Promise<ProcessRefundProofResult> {
  const supabase = createAdminClient();

  const { data: customer } = await supabase
    .from("mkc_refund_customers")
    .select("id, customer_name, phone, refund_amount, opening_paid_amount")
    .eq("id", input.customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) return { ok: false, error: "Customer refund tidak ditemukan" };

  const { data: installments, error: instError } = await supabase
    .from("mkc_refund_installments")
    .select("id, due_month, amount, is_paid")
    .eq("customer_id", customer.id)
    .order("due_month", { ascending: true });
  if (instError) return { ok: false, error: instError.message };
  const all = installments ?? [];

  let target = null as (typeof all)[number] | null;
  if (input.installmentId) {
    target = all.find((i) => i.id === input.installmentId) ?? null;
    if (!target) return { ok: false, error: "Termin tidak ditemukan untuk customer ini" };
  } else if (input.month) {
    const sameMonth = all.filter((i) => {
      const [y, m] = i.due_month.split("-").map(Number);
      return m === input.month && (!input.year || y === input.year);
    });
    target = sameMonth.find((i) => !i.is_paid) ?? sameMonth[0] ?? null;
    if (!target) return { ok: false, error: "Customer ini tidak punya termin di bulan tersebut" };
  } else {
    // Oldest unpaid termin -- overdue ones get paid first.
    target = all.find((i) => !i.is_paid) ?? null;
  }

  if (target && !target.is_paid) {
    const { error } = await supabase
      .from("mkc_refund_installments")
      .update({ is_paid: true, paid_at: new Date().toISOString(), paid_by: input.actorEmployeeId })
      .eq("id", target.id);
    if (error) return { ok: false, error: error.message };
    target = { ...target, is_paid: true };
  }

  const afterPayment = all.map((i) => (target && i.id === target.id ? { ...i, is_paid: true } : i));
  const paidAmount = Number(customer.opening_paid_amount) + afterPayment.filter((i) => i.is_paid).reduce((s, i) => s + Number(i.amount), 0);
  const remainingAmount = Math.max(Number(customer.refund_amount) - paidAmount, 0);
  const installment = target ? { dueMonth: target.due_month, amount: Number(target.amount) } : null;
  const nextInstallment = findNextUnpaidTermin(afterPayment);

  const { data: proof, error: proofError } = await supabase
    .from("mkc_refund_transfer_proofs")
    .insert({
      customer_id: customer.id,
      installment_id: target?.id ?? null,
      storage_path: input.storagePath,
      content_type: input.contentType,
      source: input.source,
      uploaded_by: input.actorEmployeeId,
    })
    .select("id")
    .single();
  if (proofError || !proof) return { ok: false, error: proofError?.message ?? "Gagal menyimpan bukti transfer" };

  const message = buildRefundProofCustomerMessage({
    customerName: customer.customer_name,
    installment,
    refundAmount: Number(customer.refund_amount),
    paidAmount,
    remainingAmount,
    nextInstallment,
  });

  const { forwarded, forwardError } = await forwardProofToCustomer({
    proofId: proof.id,
    customerId: customer.id,
    customerPhone: customer.phone,
    storagePath: input.storagePath,
    contentType: input.contentType,
    message,
    chatLabel: installment ? ` — termin ${formatRefundMonthLong(installment.dueMonth)}` : "",
    actorEmployeeId: input.actorEmployeeId,
  });

  return {
    ok: true,
    customerName: customer.customer_name,
    customerPhone: customer.phone,
    installment,
    nextInstallment,
    paidAmount,
    remainingAmount,
    forwarded,
    forwardError,
  };
}

/**
 * Sends a stored proof to the customer's WhatsApp, records the outcome on
 * the proof row and as an outbound message in the customer's chat. Used on
 * first processing and by "Kirim ulang" in /refund.
 */
async function forwardProofToCustomer(input: {
  proofId: string;
  customerId: string;
  customerPhone: string | null;
  storagePath: string;
  contentType: string;
  message: string;
  chatLabel: string;
  actorEmployeeId: string;
}): Promise<{ forwarded: boolean; forwardError: string | null }> {
  const supabase = createAdminClient();
  let forwarded = false;
  let forwardError: string | null = null;

  const phone = normalizeIndonesianPhone(input.customerPhone ?? "");
  if (phone.length < 10) {
    forwardError = "Nomor HP customer belum ada";
  } else {
    // Whacenter rejects Supabase signed URLs (query string) -- use the short link route instead.
    const fileUrl = createWaMediaUrl(REFUND_PROOF_BUCKET, input.storagePath, FORWARD_URL_TTL_SECONDS);
    // A document has no caption on WhatsApp, so the message follows it as text.
    const result =
      input.contentType === "application/pdf"
        ? await sendWhatsAppDocument(phone, fileUrl, "bukti-transfer-refund.pdf").then(async (r) =>
            r.success ? sendWhatsAppText(phone, input.message) : r,
          )
        : await sendWhatsAppImage(phone, fileUrl, input.message);
    forwarded = result.success;
    forwardError = result.success ? null : (result.error ?? "unknown error");
  }
  if (!forwarded) logger.warn("refund-proof: forward to customer failed", { customer_id: input.customerId, error: forwardError });

  await supabase
    .from("mkc_refund_transfer_proofs")
    .update({ forward_status: forwarded ? "sent" : "failed", forward_error: forwardError, forwarded_at: forwarded ? new Date().toISOString() : null })
    .eq("id", input.proofId);

  await supabase.from("mkc_refund_chat_messages").insert({
    customer_id: input.customerId,
    direction: "outbound",
    body: `📎 [Bukti transfer${input.chatLabel}]\n${input.message}`,
    sent_by: input.actorEmployeeId,
    delivery_status: forwarded ? "sent" : "failed",
    error: forwardError,
  });

  return { forwarded, forwardError };
}

/** "Kirim ulang" for a proof whose forward failed (or that the customer asks for again). */
export async function resendRefundTransferProof(proofId: string, actorEmployeeId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { data: proof } = await supabase
    .from("mkc_refund_transfer_proofs")
    .select("id, customer_id, installment_id, storage_path, content_type")
    .eq("id", proofId)
    .maybeSingle();
  if (!proof) return { ok: false, error: "Bukti transfer tidak ditemukan" };

  const { data: customer } = await supabase
    .from("mkc_refund_customers")
    .select("id, customer_name, phone, refund_amount, opening_paid_amount")
    .eq("id", proof.customer_id)
    .maybeSingle();
  if (!customer) return { ok: false, error: "Customer refund tidak ditemukan" };

  const { data: installments } = await supabase
    .from("mkc_refund_installments")
    .select("id, due_month, amount, is_paid")
    .eq("customer_id", customer.id);
  const all = installments ?? [];
  const target = all.find((i) => i.id === proof.installment_id) ?? null;
  const paidAmount = Number(customer.opening_paid_amount) + all.filter((i) => i.is_paid).reduce((s, i) => s + Number(i.amount), 0);
  const installment = target ? { dueMonth: target.due_month, amount: Number(target.amount) } : null;
  const message = buildRefundProofCustomerMessage({
    customerName: customer.customer_name,
    installment,
    refundAmount: Number(customer.refund_amount),
    paidAmount,
    remainingAmount: Math.max(Number(customer.refund_amount) - paidAmount, 0),
    nextInstallment: findNextUnpaidTermin(all),
  });

  const { forwarded, forwardError } = await forwardProofToCustomer({
    proofId: proof.id,
    customerId: customer.id,
    customerPhone: customer.phone,
    storagePath: proof.storage_path,
    contentType: proof.content_type,
    message,
    chatLabel: installment ? ` — termin ${formatRefundMonthLong(installment.dueMonth)}` : "",
    actorEmployeeId,
  });
  return forwarded ? { ok: true } : { ok: false, error: forwardError ?? "Gagal mengirim" };
}
