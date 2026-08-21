import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recognizeFundRequestText, type FundRequestItem, type FundRequestKategori, type FundRequestRecognition } from "@/lib/ai/domains/contractor-fund-request-recognition";

export type ContractorFundRequestOutcome =
  | { outcome: "not_a_request" }
  | { outcome: "needs_category_clarification"; nominal: number; keterangan: string }
  | { outcome: "sync_failed"; error: string }
  | { outcome: "submitted"; nominal: number; keterangan: string; items: FundRequestItem[]; kategori: FundRequestKategori };

/** Always the same project Endy already submits Anang's advances under -- see accountForSender in material-receipt-submission.ts. */
const PROYEK_CODE = "LL";
const PROYEK_NAMA = "Loonars Living";

/** Owner's ask: split gaji (weekly, Saturdays) and material into their real accounting categories instead of one "Biaya Subkontraktor" bucket. */
const AKUN_BY_KATEGORI: Record<FundRequestKategori, { jenisAkun: string; jenisNama: string }> = {
  gaji: { jenisAkun: "5-1003", jenisNama: "Biaya Upah Tukang" },
  material: { jenisAkun: "5-1001", jenisNama: "Pembelian Material" },
};

/** "taco vinyl (Rp 500.000); lem (Rp 200.000)" -- same joined-text convention material-receipt-submission.ts uses for mkh-properti's pengajuan.item. */
function formatItemSummary(items: FundRequestItem[]): string {
  return items.map((it) => `${it.nama} (Rp ${it.harga.toLocaleString("id-ID")})`).join("; ");
}

/**
 * Owner's ask: Anang can request a fund advance himself on WhatsApp, in
 * his own words -- no rigid command syntax, just explaining what he needs
 * and how much. AI reads whether the message is a genuine request,
 * extracts EVERY item he listed with its own value (not one combined
 * summary -- same bar as a nota photo's breakdown), and classifies it as
 * gaji (upah tukang, paid weekly on Saturdays) or material -- never
 * guessed: an unclear category returns needs_category_clarification so the
 * caller asks him outright instead of miscategorizing real bookkeeping.
 * Once categorized, it becomes a pengajuan through the SAME pipeline
 * Endy's own requests already use (tipe='bahan', jenis Biaya Upah
 * Tukang/5-1003 or Pembelian Material/5-1001) -- Vando still has to judge
 * and approve it (verifikasi.html or WhatsApp) before Super Admin
 * transfers anything. Reuses mkh-properti's material_expense_receipt_submitted
 * sync_inbound event (0027/0028/0029) since the resulting pengajuan is
 * identical in shape to a nota-derived one; `sumber` distinguishes this as
 * a contractor-initiated request rather than an AI-read nota.
 */
export async function tryHandleContractorFundRequest(contractor: { id: string; fullName: string }, text: string): Promise<ContractorFundRequestOutcome> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { outcome: "not_a_request" };
  }

  const ai: FundRequestRecognition = await recognizeFundRequestText(trimmed).catch(
    (): FundRequestRecognition => ({ isRequest: false, items: [], nominal: null, kategori: null, notes: "Analisa AI gagal." }),
  );

  if (!ai.isRequest || ai.nominal === null) {
    return { outcome: "not_a_request" };
  }

  // Fall back to a single pseudo-item (the whole message) when he only gave
  // one lump-sum total with no per-item breakdown -- still lets the
  // request through, just without a line-by-line list to show Vando.
  const items: FundRequestItem[] = ai.items.length > 0 ? ai.items : [{ nama: trimmed.slice(0, 200), harga: ai.nominal }];
  const keterangan = formatItemSummary(items);

  if (ai.kategori === null) {
    return { outcome: "needs_category_clarification", nominal: ai.nominal, keterangan };
  }

  const { jenisAkun, jenisNama } = AKUN_BY_KATEGORI[ai.kategori];
  const supabase = createAdminClient();
  const idempotencyKey = `contractor-fund-request-${contractor.id}-${Date.now()}-${crypto.randomUUID()}`;

  const { error } = await supabase.from("sync_log").insert({
    direction: "outbound",
    event_type: "material_expense_receipt_submitted",
    source_table: "whatsapp_contractor_request",
    source_id: crypto.randomUUID(),
    idempotency_key: idempotencyKey,
    payload: {
      proyek: PROYEK_CODE,
      proyek_nama: PROYEK_NAMA,
      items: items.map((it) => ({ nama: it.nama, nilai: it.harga })),
      item: keterangan,
      nominal: ai.nominal,
      keterangan,
      jenis_akun: jenisAkun,
      jenis_nama: jenisNama,
      pengawas: contractor.fullName,
      created_by_label: `Kontraktor: ${contractor.fullName}`,
      sumber: "whatsapp_contractor_request",
      ai_notes: ai.notes,
    },
  });

  if (error) {
    return { outcome: "sync_failed", error: error.message };
  }

  return { outcome: "submitted", nominal: ai.nominal, keterangan, items, kategori: ai.kategori };
}
