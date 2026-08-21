import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recognizeFundRequestText, type FundRequestRecognition } from "@/lib/ai/domains/contractor-fund-request-recognition";

export type ContractorFundRequestOutcome =
  | { outcome: "not_a_request" }
  | { outcome: "sync_failed"; error: string }
  | { outcome: "submitted"; nominal: number; keterangan: string };

/** Always the same project/category Endy already submits Anang's advances under -- see accountForSender in material-receipt-submission.ts. */
const PROYEK_CODE = "LL";
const PROYEK_NAMA = "Loonars Living";
const JENIS_AKUN = "5-1004";
const JENIS_NAMA = "Biaya Subkontraktor";

/**
 * Owner's ask: Anang can now request a fund advance himself on WhatsApp,
 * in his own words -- no rigid command syntax, just explaining what he
 * needs and how much. AI reads whether the message is a genuine request
 * and extracts the amount + reason; if so, it becomes a pengajuan through
 * the EXACT same pipeline Endy's own requests already use (tipe='bahan',
 * jenis Biaya Subkontraktor/5-1004) -- Vando still has to judge and
 * approve it (verifikasi.html or WhatsApp) before Super Admin transfers
 * anything. Reuses mkh-properti's material_expense_receipt_submitted
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
    (): FundRequestRecognition => ({ isRequest: false, nominal: null, keterangan: null, notes: "Analisa AI gagal." }),
  );

  if (!ai.isRequest || ai.nominal === null || !ai.keterangan) {
    return { outcome: "not_a_request" };
  }

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
      items: [{ nama: ai.keterangan, nilai: ai.nominal }],
      item: ai.keterangan,
      nominal: ai.nominal,
      keterangan: ai.keterangan,
      jenis_akun: JENIS_AKUN,
      jenis_nama: JENIS_NAMA,
      pengawas: contractor.fullName,
      created_by_label: `Kontraktor: ${contractor.fullName}`,
      sumber: "whatsapp_contractor_request",
      ai_notes: ai.notes,
    },
  });

  if (error) {
    return { outcome: "sync_failed", error: error.message };
  }

  return { outcome: "submitted", nominal: ai.nominal, keterangan: ai.keterangan };
}
