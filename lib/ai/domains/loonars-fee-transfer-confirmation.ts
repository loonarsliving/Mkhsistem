import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { isNominalMismatch } from "@/lib/ai/domains/transfer-proof-confirmation";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoonarsFeeTransferConfirmationOutcome =
  | { outcome: "not_super_admin" }
  | { outcome: "no_match" }
  | {
      outcome: "confirmed";
      marketingName: string;
      marketingPhone: string | null;
      unitBlok: string;
      projectName: string;
      buyerName: string | null;
      feeAmount: number;
      ai: TransferProofRecognition;
    };

/** Words shorter than this are too generic to count as a real name match either way. */
const MIN_MATCH_WORD_LENGTH = 4;

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= MIN_MATCH_WORD_LENGTH);
}

/** True when the photo's recognized recipient text shares at least one meaningful word with the marketing rep's own name (e.g. "Wahyudha"/"Wibisono" appearing on the receipt as the transfer's Penerima). */
function recipientNameMatches(marketingName: string, aiRecipientText: string | null): boolean {
  if (!aiRecipientText) return false;
  const aiWords = new Set(significantWords(aiRecipientText));
  if (aiWords.size === 0) return false;
  return significantWords(marketingName).some((w) => aiWords.has(w));
}

/**
 * Owner's ask: after approving a Loonars fee claim in the app and paying the
 * marketing rep directly (bank transfer), reuse the exact same "Super Admin
 * replies with a bukti transfer photo on WhatsApp" pattern already used for
 * pengajuan bahan/tukang (transfer-proof-confirmation.ts) and construction
 * expense settlement (construction-expense-settlement.ts) -- instead of the
 * photo landing in an unrelated group chat that has no idea what to do with
 * it (real incident: posted to the "Loonars" group, which only knows about
 * pengajuan gaji tukang/pembelian bahan).
 *
 * Matches by nominal (fee_amount) AND requires the photo's recognized
 * recipient text to share a name word with the marketing rep's own name --
 * nominal alone risks matching an unrelated transfer of the same amount,
 * same real-incident class as construction-expense-settlement.ts's own name
 * check. Deliberately silent on anything short of a full match ("no_match",
 * not an error) so this never swallows a bukti transfer meant for the
 * ordinary bahan/tukang flow -- the caller falls through to
 * tryConfirmTransferProofViaWhatsApp on anything but "confirmed".
 */
export async function tryConfirmLoonarsFeeTransferViaWhatsApp(
  sender: { id: string; name: string; roleKey: string | null },
  imageUrl: string,
): Promise<LoonarsFeeTransferConfirmationOutcome> {
  if (sender.roleKey !== "super_admin") {
    return { outcome: "not_super_admin" };
  }

  const supabase = createAdminClient();
  const { data: pendingRows } = await supabase
    .from("loonars_unit_fee_requests")
    .select(
      "id, fee_amount, loonars_unit_purchases(buyer_name), marketing:employees!loonars_unit_fee_requests_marketing_employee_id_fkey(full_name, phone), loonars_units(blok, loonars_projects(nama))",
    )
    .eq("status", "approved")
    .is("transfer_confirmed_at", null)
    .order("decided_at", { ascending: true });

  if (!pendingRows || pendingRows.length === 0) {
    return { outcome: "no_match" };
  }

  const image = await fetchImageAsBase64(imageUrl);
  const ai: TransferProofRecognition =
    image && !image.fetchError
      ? await recognizeTransferProof({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(
          (): TransferProofRecognition => ({ readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Analisa AI gagal." }),
        )
      : { readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Foto tidak bisa diunduh untuk dianalisa AI." };

  if (!ai.readable || ai.nominal === null) {
    return { outcome: "no_match" };
  }

  type Row = {
    id: string;
    fee_amount: number;
    loonars_unit_purchases: { buyer_name: string | null } | null;
    marketing: { full_name: string; phone: string | null } | null;
    loonars_units: { blok: string | null; loonars_projects: { nama: string | null } | null } | null;
  };
  const rows = pendingRows as unknown as Row[];

  const match = rows.find((row) => !isNominalMismatch(Number(row.fee_amount), ai.nominal) && row.marketing && recipientNameMatches(row.marketing.full_name, ai.rekeningTujuan));
  if (!match || !match.marketing) {
    return { outcome: "no_match" };
  }

  const { data: claimedRows } = await supabase
    .from("loonars_unit_fee_requests")
    .update({ transfer_confirmed_at: new Date().toISOString(), transfer_confirmed_by: sender.id, transfer_proof_url: imageUrl })
    .eq("id", match.id)
    .is("transfer_confirmed_at", null)
    .select("id");

  if (!claimedRows || claimedRows.length === 0) {
    // Someone else confirmed it between the read and the write -- treat like
    // no match rather than double-forwarding a proof that already went out.
    return { outcome: "no_match" };
  }

  return {
    outcome: "confirmed",
    marketingName: match.marketing.full_name,
    marketingPhone: match.marketing.phone,
    unitBlok: match.loonars_units?.blok ?? "-",
    projectName: match.loonars_units?.loonars_projects?.nama ?? "-",
    buyerName: match.loonars_unit_purchases?.buyer_name ?? null,
    feeAmount: Number(match.fee_amount),
    ai,
  };
}
