import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { isNominalMismatch } from "@/lib/ai/domains/transfer-proof-confirmation";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConstructionExpenseSettlementOutcome =
  | { outcome: "not_super_admin" }
  | { outcome: "no_match" }
  | {
      outcome: "settled";
      partyName: string;
      projectName: string;
      branchName: string;
      amount: number;
      ai: TransferProofRecognition;
      recipient: { name: string; phone: string } | null;
    };

/**
 * Real incident: Fasly (Kepala Cabang Kendari) logged a Rp 20.570.500 cash
 * material purchase (construction_expenses, expense_type=material_tunai --
 * a separate module from mkh-properti's pengajuan/finance_pending_transfers
 * used by Loonars Living/Jogja), Owner transferred him that exact amount to
 * settle it, and the bukti transfer photo got a flat "tidak cocok dengan
 * pengajuan manapun" -- tryConfirmTransferProofViaWhatsApp only ever knew
 * about finance_pending_transfers, which construction_expenses never
 * populates. is_settled/settled_at/settled_by already existed on the table
 * with nothing driving them from WhatsApp.
 *
 * Deliberately silent on anything short of an exact nominal match (returns
 * "no_match", not an error) -- unlike the caption-gated project fund top-up
 * (construction-fund-transfer-confirmation.ts), this has no caption
 * requirement, so it must not swallow bukti transfer photos meant for the
 * ordinary pengajuan flow just because the photo happened to be unreadable.
 * The caller falls through to tryConfirmTransferProofViaWhatsApp on
 * anything but "settled".
 */
export async function tryConfirmConstructionExpenseSettlementViaWhatsApp(
  sender: { id: string; name: string; roleKey: string | null },
  imageUrl: string,
): Promise<ConstructionExpenseSettlementOutcome> {
  if (sender.roleKey !== "super_admin") {
    return { outcome: "not_super_admin" };
  }

  const supabase = createAdminClient();
  const { data: pendingRows } = await supabase
    .from("construction_expenses")
    .select("id, party_name, amount, created_by, project:project_id(name), branch:branch_id(name)")
    .eq("is_settled", false)
    .order("created_at", { ascending: true });

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

  const match = pendingRows.find((row) => !isNominalMismatch(Number(row.amount), ai.nominal));
  if (!match) {
    return { outcome: "no_match" };
  }

  const { data: claimedRows } = await supabase
    .from("construction_expenses")
    .update({ is_settled: true, settled_at: new Date().toISOString(), settled_by: sender.id })
    .eq("id", match.id)
    .eq("is_settled", false)
    .select("id");

  if (!claimedRows || claimedRows.length === 0) {
    // Someone else settled it between the read and the write -- treat like
    // no match rather than double-reporting a settlement that already happened.
    return { outcome: "no_match" };
  }

  let recipient: { name: string; phone: string } | null = null;
  if (match.created_by) {
    const { data: creator } = await supabase.from("employees").select("full_name, phone").eq("id", match.created_by).maybeSingle();
    if (creator?.phone) {
      recipient = { name: creator.full_name, phone: creator.phone };
    }
  }

  const project = match.project as unknown as { name: string } | null;
  const branch = match.branch as unknown as { name: string } | null;

  return {
    outcome: "settled",
    partyName: match.party_name,
    projectName: project?.name ?? "-",
    branchName: branch?.name ?? "-",
    amount: Number(match.amount),
    ai,
    recipient,
  };
}
