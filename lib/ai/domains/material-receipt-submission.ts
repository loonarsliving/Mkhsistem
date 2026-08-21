import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeExpenseReceipt, type ExpenseReceiptRecognition } from "@/lib/ai/domains/expense-receipt-recognition";
import { createAdminClient } from "@/lib/supabase/admin";

export type MaterialReceiptSubmissionOutcome =
  | { outcome: "not_eligible_sender" }
  | { outcome: "no_caption_keyword" }
  | { outcome: "unreadable" }
  | { outcome: "sync_failed"; error: string }
  | { outcome: "submitted"; itemSummary: string; nominal: number; ai: ExpenseReceiptRecognition };

/**
 * Always the same project (Loonars Living) -- both Endy and Rebecca are
 * based there today. If that ever changes, this needs a real
 * caption/project-selection step instead (see
 * construction-fund-transfer-confirmation.ts for that pattern).
 */
const PROYEK_CODE = "LL";
const PROYEK_NAMA = "Loonars Living";

/** Endy submits material/bahan (5-1001); Rebecca submits operational/biaya-lain (6-1007) -- mirrors lapor-pengeluaran.html vs lapor-biaya-lain.html in mkh-properti. */
function accountForSender(fullName: string): { jenisAkun: string; jenisNama: string; label: string } {
  if (/rebecca/i.test(fullName)) {
    return { jenisAkun: "6-1007", jenisNama: "Beban Lain-lain", label: `Pelapor: ${fullName} (via WhatsApp AI)` };
  }
  return { jenisAkun: "5-1001", jenisNama: "Pembelian Material", label: `Pengawas: ${fullName} (via WhatsApp AI)` };
}

/** "Semen 5 sak (Rp 500.000); Paku 2kg (Rp 50.000)" -- same joined-text convention lapor-pengeluaran.html builds from its own multi-item form. */
function formatItemSummary(items: { nama: string; harga: number }[]): string {
  return items.map((it) => `${it.nama} (Rp ${it.harga.toLocaleString("id-ID")})`).join("; ");
}

/**
 * Owner's request: Endy or Rebecca can send a nota (receipt) photo captioned
 * "nota" instead of filling in mkh-properti's lapor-pengeluaran.html /
 * lapor-biaya-lain.html by hand. AI reads every line item (not one combined
 * summary) and the total off the photo -- the photo itself is never stored
 * (fetched into memory, read once, then discarded) -- and the resulting
 * pengajuan is created in mkh-properti via sync_inbound's
 * material_expense_receipt_submitted event (0027/0028), exactly like a
 * manual submission: same tipe='bahan', same multi-item data shape, same
 * Kepala Cabang (Vando) WhatsApp notification before Super Admin transfers
 * the money. Gated on an explicit "nota" caption keyword so it never
 * collides with Endy's other photo flows on the same number (auto-forward
 * justification photos, construction progress-by-blok tracking, "kirim ke
 * ..." relay), which have no caption requirement or a different one.
 */
export async function tryHandleReceiptPhotoSubmission(
  sender: { id: string; fullName: string },
  imageUrl: string,
  caption: string | null | undefined,
): Promise<MaterialReceiptSubmissionOutcome> {
  const isEligible = /endy|rebecca/i.test(sender.fullName);
  if (!isEligible) {
    return { outcome: "not_eligible_sender" };
  }

  const captionLower = (caption ?? "").trim().toLowerCase();
  if (!captionLower.includes("nota")) {
    return { outcome: "no_caption_keyword" };
  }

  const image = await fetchImageAsBase64(imageUrl);
  const ai: ExpenseReceiptRecognition =
    image && !image.fetchError
      ? await recognizeExpenseReceipt({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(
          (): ExpenseReceiptRecognition => ({ readable: false, items: [], nominal: null, tanggal: null, supplier: null, notes: "Analisa AI gagal." }),
        )
      : { readable: false, items: [], nominal: null, tanggal: null, supplier: null, notes: "Foto tidak bisa diunduh untuk dianalisa AI." };

  if (!ai.readable || ai.nominal === null || ai.items.length === 0) {
    return { outcome: "unreadable" };
  }

  const itemSummary = formatItemSummary(ai.items);
  const { jenisAkun, jenisNama, label } = accountForSender(sender.fullName);
  const supabase = createAdminClient();
  const idempotencyKey = `material-receipt-${sender.id}-${Date.now()}-${crypto.randomUUID()}`;

  const { error: syncLogError } = await supabase.from("sync_log").insert({
    direction: "outbound",
    event_type: "material_expense_receipt_submitted",
    source_table: "whatsapp_receipt",
    source_id: crypto.randomUUID(),
    idempotency_key: idempotencyKey,
    payload: {
      proyek: PROYEK_CODE,
      proyek_nama: PROYEK_NAMA,
      items: ai.items.map((it) => ({ nama: it.nama, nilai: it.harga })),
      item: itemSummary,
      nominal: ai.nominal,
      tgl: ai.tanggal,
      supplier: ai.supplier,
      keterangan: ai.supplier ? `${itemSummary} (${ai.supplier})` : itemSummary,
      jenis_akun: jenisAkun,
      jenis_nama: jenisNama,
      pengawas: sender.fullName,
      created_by_label: label,
      ai_notes: ai.notes,
    },
  });

  if (syncLogError) {
    return { outcome: "sync_failed", error: syncLogError.message };
  }

  return { outcome: "submitted", itemSummary, nominal: ai.nominal, ai };
}
