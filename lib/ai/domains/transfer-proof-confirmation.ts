import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { createAdminClient } from "@/lib/supabase/admin";

export type TransferProofConfirmationOutcome =
  | { outcome: "not_super_admin" }
  | { outcome: "no_pending_transfer" }
  | { outcome: "sync_failed"; error: string }
  | {
      outcome: "no_amount_match";
      readNominal: number;
      candidates: { partyName: string | null; nominal: number }[];
    }
  | {
      outcome: "confirmed";
      tipe: "bahan" | "tukang";
      partyName: string | null;
      nominal: number;
      ai: TransferProofRecognition;
      mismatch: boolean;
      matchedByAmount: boolean;
      recipients: { name: string; phone: string }[];
    };

/**
 * >6500 rupiah or >0.5% off (whichever is larger) counts as a mismatch.
 * The floor covers ordinary interbank admin fees (BI-FAST/SKN/RTGS are
 * typically Rp 2500-6500) that can make the amount actually debited from
 * the sender differ slightly from the pengajuan's nominal, or from
 * whichever of the two figures on the receipt the AI happens to read.
 */
function isNominalMismatch(expected: number, read: number | null): boolean {
  if (read === null) return false;
  const tolerance = Math.max(6500, expected * 0.005);
  return Math.abs(read - expected) > tolerance;
}

/**
 * finance_pending_transfers.admin_email actually carries a free-text
 * "Pengawas: Endy" / "Pelapor: Rebecca" label from mkh-properti (who
 * actually submitted the pengajuan there), not a real email address.
 * Strips the label prefix to get the bare name for matching against
 * employees.full_name.
 */
export function extractSubmitterName(adminEmail: string | null): string | null {
  if (!adminEmail) return null;
  const match = adminEmail.match(/^(?:Pengawas|Pelapor)\s*:\s*(.+)$/i);
  const name = (match ? match[1] : adminEmail).trim();
  return name || null;
}

/**
 * Super Admin's WhatsApp reply with the bukti transfer photo -- the real
 * final approval that posts jurnal in mkh-properti (0018/0222).
 *
 * Reads the photo FIRST (before claiming anything), then tries to match
 * its AI-read nominal against every still-pending transfer -- not just the
 * oldest one -- so sending a bukti transfer out of submission order still
 * lands on the right pengajuan instead of silently confirming whatever
 * happens to be at the front of the queue.
 *
 * Falls back to FIFO (oldest pending) ONLY when the photo itself is
 * unreadable -- there's genuinely nothing better to go on. When the photo
 * IS readable but its nominal doesn't match any pending row, this used to
 * still confirm the oldest one anyway (mismatch surfaced only as a
 * non-blocking warning) -- in practice that meant an unrelated photo (e.g.
 * a PLN token receipt sent by mistake) would get silently attached to
 * whatever pengajuan happened to be first in the queue, real money
 * example: Rp 503.500 token listrik receipt auto-confirmed a Rp 76.343
 * ongkir pengajuan it had nothing to do with. Now a readable-but-unmatched
 * nominal returns no_amount_match instead of guessing -- Super Admin has
 * to say which pengajuan it's actually for (or resend the right photo).
 */
export async function tryConfirmTransferProofViaWhatsApp(
  sender: { id: string; name: string; roleKey: string | null },
  imageUrl: string,
): Promise<TransferProofConfirmationOutcome> {
  if (sender.roleKey !== "super_admin") {
    return { outcome: "not_super_admin" };
  }

  const supabase = createAdminClient();
  const { data: pendingRows } = await supabase
    .from("finance_pending_transfers")
    .select("id, pengajuan_id, proyek, tipe, branch_id, party_name, nominal, admin_email")
    .is("confirmed_at", null)
    .is("rejected_at", null)
    .order("created_at", { ascending: true });

  if (!pendingRows || pendingRows.length === 0) {
    return { outcome: "no_pending_transfer" };
  }

  const image = await fetchImageAsBase64(imageUrl);
  const ai: TransferProofRecognition =
    image && !image.fetchError
      ? await recognizeTransferProof({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(
          (): TransferProofRecognition => ({ readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Analisa AI gagal, foto tetap dicatat sebagai bukti transfer." }),
        )
      : { readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Foto tidak bisa diunduh untuk dianalisa AI, tetap dicatat sebagai bukti transfer." };

  let target = pendingRows[0];
  let matchedByAmount = false;
  if (ai.readable && ai.nominal !== null) {
    const amountMatches = pendingRows.filter((p) => !isNominalMismatch(Number(p.nominal), ai.nominal));
    if (amountMatches.length > 0) {
      target = amountMatches[0];
      matchedByAmount = true;
    } else {
      return {
        outcome: "no_amount_match",
        readNominal: ai.nominal,
        candidates: pendingRows.map((p) => ({ partyName: p.party_name, nominal: Number(p.nominal) })),
      };
    }
  }

  // Race-safe claim, same pattern as the fee-approval flow: only one
  // concurrent reply can actually win this row.
  const { data: claimedRows } = await supabase
    .from("finance_pending_transfers")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: sender.id })
    .eq("id", target.id)
    .is("confirmed_at", null)
    .is("rejected_at", null)
    .select("id, pengajuan_id, proyek, tipe, branch_id, party_name, nominal, admin_email");

  if (!claimedRows || claimedRows.length === 0) {
    return { outcome: "no_pending_transfer" };
  }
  const row = claimedRows[0];
  const nominal = Number(row.nominal);

  const { error: syncLogError } = await supabase.from("sync_log").insert({
    direction: "outbound",
    event_type: "finance_expense_transfer_confirmed",
    source_table: "finance_pending_transfers",
    // row.id is already a real uuid (finance_pending_transfers.id) --
    // sync_log.source_id is a uuid column, pengajuan_id (bigint) doesn't
    // fit it. Previously this inserted String(row.pengajuan_id), which
    // silently failed every single time (invalid uuid), meaning nothing
    // ever actually posted to mkh-properti's jurnal despite the WA reply
    // claiming success -- only caught by cross-checking a real case.
    source_id: row.id,
    // Includes a fresh random suffix, not just row.id -- the race-safe
    // claim above (confirmed_at IS NULL) is what actually prevents double
    // processing, so this doesn't need to be deterministic across retries.
    // A purely row.id-based key collided with sync_log's own unique
    // constraint on every retry after a legitimate reset (e.g. correcting
    // a wrong nominal match, or a prior sync_failed rollback), since the
    // earlier attempt's row -- succeeded or failed -- had already taken
    // that exact key permanently.
    idempotency_key: `transfer-confirmed-${row.pengajuan_id}-${row.id}-${crypto.randomUUID()}`,
    payload: {
      pengajuan_id: row.pengajuan_id,
      bukti_transfer_url: imageUrl,
      ai_nominal: ai.nominal,
      ai_tanggal: ai.tanggal,
      ai_rekening: ai.rekeningTujuan,
      confirmed_by: sender.name,
    },
  });
  if (syncLogError) {
    // Un-claim so the next bukti transfer reply can retry this same
    // pengajuan instead of it being stuck "confirmed" with nothing ever
    // synced -- never silently report success on a write that didn't happen.
    await supabase.from("finance_pending_transfers").update({ confirmed_at: null, confirmed_by: null }).eq("id", row.id);
    return { outcome: "sync_failed", error: syncLogError.message };
  }

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
  // Forward to whoever actually submitted this pengajuan (mkh-properti's
  // "Pengawas: Endy" / "Pelapor: Rebecca" label) instead of always Endy --
  // Rebecca submits operational expenses (outside bahan/tukang) the same
  // way Endy submits material/tukang, so the bukti transfer should reach
  // whichever of them actually needs to pass it on.
  const submitterName = extractSubmitterName(row.admin_email);
  let submitterMatched = false;
  if (submitterName) {
    const { data: submitterRows } = await supabase
      .from("employees")
      .select("full_name, phone")
      .ilike("full_name", `%${submitterName}%`)
      .not("phone", "is", null)
      .is("deleted_at", null)
      .eq("employment_status", "active")
      .limit(1);
    const submitter = submitterRows?.[0];
    if (submitter?.phone && !recipients.some((r) => r.phone === submitter.phone)) {
      recipients.push({ name: submitter.full_name, phone: submitter.phone });
      submitterMatched = true;
    }
  }
  if (!submitterMatched) {
    // Fallback for anything unattributed (no admin_email label, or the
    // name doesn't match an active employee) -- Endy remains the default
    // since he's still the primary on-site submitter.
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
  }

  return {
    outcome: "confirmed",
    tipe: row.tipe as "bahan" | "tukang",
    partyName: row.party_name,
    nominal,
    ai,
    mismatch: isNominalMismatch(nominal, ai.nominal),
    matchedByAmount,
    recipients,
  };
}
