import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { createAdminClient } from "@/lib/supabase/admin";

export type TransferProofConfirmationOutcome =
  | { outcome: "not_super_admin" }
  | { outcome: "no_pending_transfer" }
  | {
      outcome: "confirmed";
      tipe: "bahan" | "tukang";
      partyName: string | null;
      nominal: number;
      ai: TransferProofRecognition;
      mismatch: boolean;
      recipients: { name: string; phone: string }[];
    };

/** >1000 rupiah or >0.5% off (whichever is larger) counts as a mismatch worth flagging -- exact-cent rounding differences shouldn't trip the warning. */
function isNominalMismatch(expected: number, read: number | null): boolean {
  if (read === null) return false;
  const tolerance = Math.max(1000, expected * 0.005);
  return Math.abs(read - expected) > tolerance;
}

/**
 * Super Admin's WhatsApp reply with the bukti transfer photo -- the real
 * final approval that posts jurnal in mkh-properti (0018/0222). FIFO-picks
 * the oldest unconfirmed pengajuan awaiting transfer, same accepted
 * trade-off as tryApproveLoonarsFeeViaWhatsApp (no per-pengajuan
 * disambiguation yet; Super Admin is expected to transfer and confirm one
 * at a time). Never blocks on an AI mismatch -- Super Admin's own judgment
 * is final, the mismatch is surfaced as a warning in the reply instead.
 */
export async function tryConfirmTransferProofViaWhatsApp(
  sender: { id: string; name: string; roleKey: string | null },
  imageUrl: string,
): Promise<TransferProofConfirmationOutcome> {
  if (sender.roleKey !== "super_admin") {
    return { outcome: "not_super_admin" };
  }

  const supabase = createAdminClient();
  const { data: pending } = await supabase
    .from("finance_pending_transfers")
    .select("id, pengajuan_id, proyek, tipe, branch_id, party_name, nominal")
    .is("confirmed_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return { outcome: "no_pending_transfer" };
  }

  // Race-safe claim, same pattern as the fee-approval flow: only one
  // concurrent reply can actually win this row.
  const { data: claimedRows } = await supabase
    .from("finance_pending_transfers")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: sender.id })
    .eq("id", pending.id)
    .is("confirmed_at", null)
    .select("id, pengajuan_id, proyek, tipe, branch_id, party_name, nominal");

  if (!claimedRows || claimedRows.length === 0) {
    return { outcome: "no_pending_transfer" };
  }
  const row = claimedRows[0];
  const nominal = Number(row.nominal);

  const image = await fetchImageAsBase64(imageUrl);
  const ai: TransferProofRecognition =
    image && !image.fetchError
      ? await recognizeTransferProof({ imageBase64: image.data, imageMimeType: image.mimeType, expectedNominal: nominal }).catch(
          (): TransferProofRecognition => ({ readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Analisa AI gagal, foto tetap dicatat sebagai bukti transfer." }),
        )
      : { readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Foto tidak bisa diunduh untuk dianalisa AI, tetap dicatat sebagai bukti transfer." };

  await supabase.from("sync_log").insert({
    direction: "outbound",
    event_type: "finance_expense_transfer_confirmed",
    source_table: "finance_pending_transfers",
    source_id: String(row.pengajuan_id),
    idempotency_key: `transfer-confirmed-${row.pengajuan_id}-${row.id}`,
    payload: {
      pengajuan_id: row.pengajuan_id,
      bukti_transfer_url: imageUrl,
      ai_nominal: ai.nominal,
      ai_tanggal: ai.tanggal,
      ai_rekening: ai.rekeningTujuan,
      confirmed_by: sender.name,
    },
  });

  const recipients: { name: string; phone: string }[] = [];
  if (row.branch_id) {
    const { data: branchKc } = await supabase
      .from("employees")
      .select("full_name, phone, role:role_id(key)")
      .eq("branch_id", row.branch_id)
      .not("phone", "is", null)
      .is("deleted_at", null)
      .eq("employment_status", "active");
    for (const emp of branchKc ?? []) {
      if ((emp.role as unknown as { key: string } | null)?.key === "kepala_cabang" && emp.phone) {
        recipients.push({ name: emp.full_name, phone: emp.phone });
      }
    }
  }
  const { data: endyRows } = await supabase
    .from("employees")
    .select("full_name, phone")
    .ilike("full_name", "%endy%")
    .not("phone", "is", null)
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .limit(1);
  const endy = endyRows?.[0];
  if (endy?.phone && !recipients.some((r) => r.phone === endy.phone)) {
    recipients.push({ name: endy.full_name, phone: endy.phone });
  }

  return {
    outcome: "confirmed",
    tipe: row.tipe as "bahan" | "tukang",
    partyName: row.party_name,
    nominal,
    ai,
    mismatch: isNominalMismatch(nominal, ai.nominal),
    recipients,
  };
}
