import "server-only";

import { ROLE_KEYS } from "@/constants/rbac";
import { logger } from "@/lib/logger";
import { REFUND_PROOF_BUCKET, processRefundTransferProof } from "@/lib/refund/transfer-proof";
import { formatRefundMonthLong, matchRefundCustomers, parseRefundProofCaption } from "@/lib/refund/transfer-proof-format";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Refund transfer proof over WhatsApp (0289): the owner (any active Super
 * Admin) or a Refund & CR officer sends the transfer photo to the company
 * number captioned "REFUND <nama customer / no urut> [bulan]" -- the same
 * habit as the villa dividend proof ("A2"). The photo is stored, the termin
 * ticked, and the proof forwarded to the customer; the sender gets a
 * confirmation reply.
 *
 * Sender-gated like LUNAS/PROMO: from any other number a "REFUND ..." photo
 * is not_applicable and falls through untouched.
 */

export type RefundTransferProofWaOutcome = { outcome: "not_applicable" } | { outcome: "handled"; reply: string };

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

/** Active Super Admin or Refund & CR officer whose phone matches the sender (last 9 digits). */
async function findAuthorizedSender(sender: string): Promise<{ id: string } | null> {
  const suffix = digitsOnly(sender).slice(-9);
  if (suffix.length < 9) return null;

  const supabase = createAdminClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("id")
    .in("key", [ROLE_KEYS.SUPER_ADMIN, ROLE_KEYS.REFUND_CUSTOMER_RELATION]);
  const roleIds = (roles ?? []).map((r) => r.id);
  if (roleIds.length === 0) return null;

  const { data: employees } = await supabase
    .from("employees")
    .select("id, phone")
    .in("role_id", roleIds)
    .eq("is_active", true)
    .is("deleted_at", null)
    .not("phone", "is", null);
  return (employees ?? []).find((e) => digitsOnly(e.phone ?? "").endsWith(suffix)) ?? null;
}

export async function tryHandleRefundTransferProofViaWhatsApp(
  sender: string,
  mediaUrl: string,
  caption: string | undefined,
): Promise<RefundTransferProofWaOutcome> {
  const parsed = parseRefundProofCaption(caption);
  if (!parsed) return { outcome: "not_applicable" };

  const actor = await findAuthorizedSender(sender);
  if (!actor) return { outcome: "not_applicable" };

  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("mkc_refund_customers")
    .select("id, customer_name, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const customers = (rows ?? []).map((r) => ({ id: r.id, name: r.customer_name, sortOrder: r.sort_order }));
  const matches = matchRefundCustomers(customers, parsed.query);

  if (matches.length === 0) {
    return {
      outcome: "handled",
      reply: `⚠️ Customer refund "${parsed.query}" tidak ditemukan. Kirim ulang fotonya dengan keterangan, contoh:\n*REFUND <nama customer>* atau *REFUND 1* (no urut di modul Refund).`,
    };
  }
  if (matches.length > 1) {
    return {
      outcome: "handled",
      reply:
        `⚠️ "${parsed.query}" cocok dengan beberapa customer:\n` +
        matches.map((m) => `${m.sortOrder}. ${m.name}`).join("\n") +
        `\n\nKirim ulang fotonya dengan nama lebih lengkap atau no urut, contoh: *REFUND ${matches[0].sortOrder}*`,
    };
  }
  const customer = matches[0];

  // Store our own copy: the WhatsApp media link is temporary, and the
  // proof must stay checkable in the system later.
  let bytes: ArrayBuffer;
  let contentType: string;
  try {
    const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    contentType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) contentType = "image/jpeg";
    bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) throw new Error("ukuran file tidak valid");
  } catch (err) {
    logger.warn("refund-proof-wa: media download failed", { error: err instanceof Error ? err.message : String(err) });
    return { outcome: "handled", reply: "⚠️ Foto bukti transfer gagal diunduh dari WhatsApp. Coba kirim ulang ya." };
  }

  const ext = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const storagePath = `${customer.id}/wa-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(REFUND_PROOF_BUCKET).upload(storagePath, bytes, { contentType, upsert: false });
  if (uploadError) {
    logger.warn("refund-proof-wa: storage upload failed", { error: uploadError.message });
    return { outcome: "handled", reply: `⚠️ Bukti transfer gagal disimpan: ${uploadError.message}` };
  }

  const result = await processRefundTransferProof({
    customerId: customer.id,
    month: parsed.month,
    year: parsed.year,
    storagePath,
    contentType,
    source: "whatsapp",
    actorEmployeeId: actor.id,
  });
  if (!result.ok) return { outcome: "handled", reply: `⚠️ ${result.error}` };

  return {
    outcome: "handled",
    reply:
      `✅ Bukti transfer refund *${result.customerName}* tersimpan.\n` +
      (result.installment
        ? `☑️ Termin ${formatRefundMonthLong(result.installment.dueMonth)} (${rupiah(result.installment.amount)}) ditandai terbayar.\n`
        : "ℹ️ Tidak ada termin yang belum dibayar — bukti disimpan tanpa mencentang termin.\n") +
      `💰 Sisa refund: ${rupiah(result.remainingAmount)}\n` +
      (result.nextInstallment
        ? `📅 Termin berikutnya: ${formatRefundMonthLong(result.nextInstallment.dueMonth)} (${rupiah(result.nextInstallment.amount)})\n`
        : "") +
      (result.forwarded
        ? `📤 Sudah diteruskan ke WhatsApp customer (${result.customerPhone}).`
        : `⚠️ Gagal diteruskan ke customer: ${result.forwardError ?? "unknown"} — bisa dikirim ulang dari modul Refund.`),
  };
}
