"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/constants/rbac";
import { normalizeIndonesianPhone } from "@/features/messaging/schemas/messaging.schema";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import { hasPermission, requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listRefundChatMessages, type RefundChatMessage } from "@/repositories/refund.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  addInstallmentSchema,
  deleteInstallmentSchema,
  refundCustomerIdSchema,
  saveRefundCustomerSchema,
  sendRefundChatSchema,
  sendRefundReminderSchema,
  toggleInstallmentPaidSchema,
  type AddInstallmentInput,
  type DeleteInstallmentInput,
  type RefundCustomerIdInput,
  type SaveRefundCustomerInput,
  type SendRefundChatInput,
  type SendRefundReminderInput,
  type ToggleInstallmentPaidInput,
} from "../schemas/refund.schema";

/**
 * Refund module mutations (0286). requirePermission() here and RLS /
 * security-definer RPC checks in the database are two independent layers --
 * neither is relied on alone.
 */

const REFUND_PATH = "/refund";

export async function toggleInstallmentPaidAction(input: ToggleInstallmentPaidInput): Promise<ActionResult> {
  await requirePermission(PERMISSIONS.REFUND_MANAGE);
  const parsed = toggleInstallmentPaidSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("refund_set_installment_paid", {
    p_installment_id: parsed.data.installmentId,
    p_paid: parsed.data.paid,
  });
  if (error) return actionError(error.message);

  revalidatePath(REFUND_PATH);
  return actionSuccess();
}

/** "Ingatkan Owner & Vando" -- in-app + WhatsApp (refund_reminder is on the WA relay allowlist). */
export async function sendRefundReminderAction(input: SendRefundReminderInput): Promise<ActionResult<{ recipients: number }>> {
  await requirePermission(PERMISSIONS.REFUND_MANAGE);
  const parsed = sendRefundReminderSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("refund_send_reminder", {
    p_customer_id: parsed.data.customerId ?? null,
    p_note: parsed.data.note?.trim() || null,
  });
  if (error) return actionError(error.message);

  revalidatePath(REFUND_PATH);
  return actionSuccess({ recipients: data as number });
}

/**
 * Sends a WhatsApp message to the customer through the company's Whacenter
 * device and records it in the conversation. A failed send is still recorded
 * (delivery_status = failed) so the officer sees it didn't go through.
 */
export async function sendRefundChatAction(input: SendRefundChatInput): Promise<ActionResult<{ messages: RefundChatMessage[] }>> {
  const session = await requirePermission(PERMISSIONS.REFUND_MANAGE);
  const parsed = sendRefundChatSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data: customer, error: customerError } = await supabase
    .from("mkc_refund_customers")
    .select("id, phone")
    .eq("id", parsed.data.customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (customerError) return actionError(customerError.message);
  if (!customer) return actionError("Customer tidak ditemukan");

  const phone = normalizeIndonesianPhone(customer.phone ?? "");
  if (phone.length < 10) return actionError("Nomor HP customer belum diisi atau tidak valid -- perbarui lewat tombol Edit.");

  const result = await sendWhatsAppText(phone, parsed.data.message);
  if (!result.success) {
    logger.warn("refund: WhatsApp send to customer failed", { customer_id: customer.id, error: result.error });
  }

  const { error: insertError } = await supabase.from("mkc_refund_chat_messages").insert({
    customer_id: customer.id,
    direction: "outbound",
    body: parsed.data.message,
    sent_by: session.userId,
    delivery_status: result.success ? "sent" : "failed",
    error: result.success ? null : (result.error ?? "unknown error"),
  });
  if (insertError) return actionError(insertError.message);

  const messages = await listRefundChatMessages(supabase, customer.id);
  if (!result.success) return actionError(`Pesan gagal terkirim ke WhatsApp: ${result.error ?? "unknown error"}`);
  return actionSuccess({ messages });
}

/** Loads a conversation and marks the customer's messages as read (polled while the chat is open). */
export async function getRefundChatAction(input: RefundCustomerIdInput): Promise<ActionResult<{ messages: RefundChatMessage[] }>> {
  const session = await requireSession();
  if (!hasPermission(session, PERMISSIONS.REFUND_VIEW) && !hasPermission(session, PERMISSIONS.REFUND_MANAGE)) {
    return actionError("Tidak punya akses");
  }
  const parsed = refundCustomerIdSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid");

  const supabase = await createClient();
  if (hasPermission(session, PERMISSIONS.REFUND_MANAGE)) {
    await supabase
      .from("mkc_refund_chat_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("customer_id", parsed.data.customerId)
      .eq("direction", "inbound")
      .is("read_at", null);
  }

  try {
    return actionSuccess({ messages: await listRefundChatMessages(supabase, parsed.data.customerId) });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memuat chat");
  }
}

export async function saveRefundCustomerAction(input: SaveRefundCustomerInput): Promise<ActionResult> {
  const session = await requirePermission(PERMISSIONS.REFUND_MANAGE);
  const parsed = saveRefundCustomerSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const v = parsed.data;
  const row = {
    customer_name: v.name,
    phone: v.phone || null,
    refund_amount: v.refundAmount,
    opening_paid_amount: v.openingPaidAmount,
    bank_name: v.bankName || null,
    bank_account_number: v.bankAccountNumber || null,
    bank_account_holder: v.bankAccountHolder || null,
    notes: v.notes || null,
    updated_by: session.userId,
  };

  const supabase = await createClient();
  const { error } = v.id
    ? await supabase.from("mkc_refund_customers").update(row).eq("id", v.id)
    : await supabase.from("mkc_refund_customers").insert({ ...row, created_by: session.userId, sort_order: 1000 });
  if (error) return actionError(error.message);

  revalidatePath(REFUND_PATH);
  return actionSuccess();
}

export async function addInstallmentAction(input: AddInstallmentInput): Promise<ActionResult> {
  await requirePermission(PERMISSIONS.REFUND_MANAGE);
  const parsed = addInstallmentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.from("mkc_refund_installments").insert({
    customer_id: parsed.data.customerId,
    due_month: `${parsed.data.month}-01`,
    amount: parsed.data.amount,
  });
  if (error) {
    if (error.code === "23505") return actionError("Customer ini sudah punya termin di bulan tersebut -- hapus dulu termin lama jika ingin mengganti.");
    return actionError(error.message);
  }

  revalidatePath(REFUND_PATH);
  return actionSuccess();
}

export async function deleteInstallmentAction(input: DeleteInstallmentInput): Promise<ActionResult> {
  await requirePermission(PERMISSIONS.REFUND_MANAGE);
  const parsed = deleteInstallmentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid");

  const supabase = await createClient();
  // RLS only allows deleting an unpaid termin; .select() makes a blocked
  // delete visible instead of a silent no-op.
  const { data, error } = await supabase.from("mkc_refund_installments").delete().eq("id", parsed.data.installmentId).select("id");
  if (error) return actionError(error.message);
  if (!data || data.length === 0) return actionError("Termin yang sudah dibayar tidak bisa dihapus -- hilangkan centangnya dulu.");

  revalidatePath(REFUND_PATH);
  return actionSuccess();
}
