import "server-only";

import { normalizeIndonesianPhone } from "@/features/messaging/schemas/messaging.schema";
import { sendWhatsAppImage } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { stageWaOutboxFile } from "@/lib/wa-media/outbox";

import { buildRefundProofCustomerMessage, findNextUnpaidTermin, formatRefundMonthLong } from "./transfer-proof-format";
import { renderRefundProofImage, type RefundProofImageInput } from "./transfer-proof-image";

export const REFUND_PROOF_BUCKET = "refund-transfer-proofs";

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
      proofId: string;
      customerName: string;
      installment: { dueMonth: string; amount: number } | null;
      nextInstallment: { dueMonth: string; amount: number } | null;
      paidAmount: number;
      remainingAmount: number;
    }
  | { ok: false; error: string };

/**
 * Shared by the WhatsApp ("REFUND <nama>" + photo) and dashboard ("Upload
 * Bukti") entry points (0289). Callers check the sender/permission first;
 * this runs with the service role. Ticks the termin and stores the proof;
 * nothing goes to the customer until an officer presses "Kirim Bukti" in
 * /refund (owner's call 2026-10-27, replacing the automatic forward) --
 * see sendRefundTransferProof.
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

  return { ok: true, proofId: proof.id, customerName: customer.customer_name, installment, nextInstallment, paidAmount, remainingAmount };
}

/**
 * Renders the proof card, sends it to the customer's WhatsApp with the
 * message as caption, records the outcome on the proof row and as an
 * outbound message (with the card) in the customer's chat.
 */
async function forwardProofToCustomer(input: {
  proofId: string;
  customerId: string;
  customerPhone: string | null;
  card: RefundProofImageInput;
  actorEmployeeId: string;
}): Promise<{ forwarded: boolean; forwardError: string | null }> {
  const supabase = createAdminClient();
  let forwarded = false;
  let forwardError: string | null = null;
  let cardPath: string | null = null;

  const message = buildRefundProofCustomerMessage(input.card);
  const chatLabel = input.card.installment ? ` — termin ${formatRefundMonthLong(input.card.installment.dueMonth)}` : "";

  const phone = normalizeIndonesianPhone(input.customerPhone ?? "");
  if (phone.length < 10) {
    forwardError = "Nomor HP customer belum ada";
  } else {
    try {
      const png = await renderRefundProofImage(input.card);
      const path = `${input.customerId}/kartu-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from(REFUND_PROOF_BUCKET).upload(path, png, { contentType: "image/png", upsert: false });
      if (uploadError) throw new Error(`simpan kartu bukti gagal (${uploadError.message})`);
      cardPath = path;
      // A public wa-outbox copy (0306): the only kind of link Whacenter reliably downloads. Safe here -- the card carries no bank details.
      const result = await sendWhatsAppImage(phone, await stageWaOutboxFile(REFUND_PROOF_BUCKET, path), message);
      forwarded = result.success;
      forwardError = result.success ? null : (result.error ?? "unknown error");
    } catch (err) {
      forwardError = err instanceof Error ? err.message : String(err);
    }
  }
  if (!forwarded) logger.warn("refund-proof: forward to customer failed", { customer_id: input.customerId, error: forwardError });

  await supabase
    .from("mkc_refund_transfer_proofs")
    .update({ forward_status: forwarded ? "sent" : "failed", forward_error: forwardError, forwarded_at: forwarded ? new Date().toISOString() : null })
    .eq("id", input.proofId);

  await supabase.from("mkc_refund_chat_messages").insert({
    customer_id: input.customerId,
    direction: "outbound",
    body: `📎 [Bukti transfer${chatLabel}]\n${message}`,
    media_path: cardPath,
    sent_by: input.actorEmployeeId,
    delivery_status: forwarded ? "sent" : "failed",
    error: forwardError,
  });

  return { forwarded, forwardError };
}

type ProofCard = { proofId: string; customerId: string; customerPhone: string | null; card: RefundProofImageInput };

/**
 * The card for a stored proof, from the numbers as they are now: the
 * proof's own termin, and total paid / remaining / next termin over every
 * termin ticked so far.
 */
async function loadProofCard(proofId: string): Promise<{ ok: true; data: ProofCard } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data: proof } = await supabase
    .from("mkc_refund_transfer_proofs")
    .select("id, customer_id, installment_id, created_at")
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
  return {
    ok: true,
    data: {
      proofId: proof.id,
      customerId: customer.id,
      customerPhone: customer.phone,
      card: {
        customerName: customer.customer_name,
        installment: target ? { dueMonth: target.due_month, amount: Number(target.amount) } : null,
        refundAmount: Number(customer.refund_amount),
        paidAmount,
        remainingAmount: Math.max(Number(customer.refund_amount) - paidAmount, 0),
        nextInstallment: findNextUnpaidTermin(all),
        paidAt: new Date(proof.created_at),
      },
    },
  };
}

/** What "Kirim Bukti" will send: the card (PNG data URL) and its caption. Nothing is sent or stored. */
export async function previewRefundTransferProof(proofId: string): Promise<{ ok: true; image: string; message: string } | { ok: false; error: string }> {
  const loaded = await loadProofCard(proofId);
  if (!loaded.ok) return loaded;
  const png = await renderRefundProofImage(loaded.data.card);
  return { ok: true, image: `data:image/png;base64,${png.toString("base64")}`, message: buildRefundProofCustomerMessage(loaded.data.card) };
}

/** "Kirim Bukti" in /refund: first send, or again after a failure / on the customer's request. */
export async function sendRefundTransferProof(proofId: string, actorEmployeeId: string): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadProofCard(proofId);
  if (!loaded.ok) return loaded;
  const { forwarded, forwardError } = await forwardProofToCustomer({ ...loaded.data, actorEmployeeId });
  return forwarded ? { ok: true } : { ok: false, error: forwardError ?? "Gagal mengirim" };
}
