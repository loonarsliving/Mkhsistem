import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { extractSubmitterName } from "./transfer-proof-confirmation";

export type TransferRejectionOutcome =
  | { outcome: "not_a_rejection" }
  | { outcome: "not_super_admin" }
  | { outcome: "not_found"; code: string }
  | { outcome: "sync_failed"; error: string }
  | {
      outcome: "rejected";
      code: string;
      partyName: string | null;
      nominal: number;
      reason: string | null;
      recipients: { name: string; phone: string }[];
    };

// Requires the explicit KK-code -- deliberately does NOT match a bare
// "tolak" with no code, so this never collides with the unrelated
// "SETUJU/TOLAK <AP-code>" approval_requests flow (approval-requests.ts),
// which does fall back to a single-pending-item match on a bare "tolak".
const REJECT_PATTERN = /^tolak\s+(kk-\S+)\s*(.*)$/i;

/**
 * Super Admin catches a Kepala Cabang's approval mistake (e.g. wrong blok)
 * before any money moves, by replying "TOLAK <kode> <alasan>" instead of
 * sending a bukti transfer photo. Mirrors
 * tryConfirmTransferProofViaWhatsApp's race-safe claim pattern, but sets
 * rejected_at instead of confirmed_at and pushes a
 * finance_expense_transfer_rejected event (0024, mkh-properti) that flips
 * the pengajuan back to 'rejected' -- nothing is posted to jurnal.
 */
export async function tryRejectPendingTransferViaWhatsApp(
  sender: { id: string; name: string; roleKey: string | null },
  text: string,
): Promise<TransferRejectionOutcome> {
  const match = text.trim().match(REJECT_PATTERN);
  if (!match) {
    return { outcome: "not_a_rejection" };
  }
  if (sender.roleKey !== "super_admin") {
    return { outcome: "not_super_admin" };
  }

  const code = match[1].toUpperCase();
  const reason = match[2]?.trim() || null;

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("finance_pending_transfers")
    .select("id, pengajuan_id, proyek, tipe, branch_id, party_name, nominal, admin_email, reference_no")
    .ilike("reference_no", code)
    .is("confirmed_at", null)
    .is("rejected_at", null)
    .maybeSingle();

  if (!row) {
    return { outcome: "not_found", code };
  }

  // Race-safe claim, same pattern as the confirm flow.
  const { data: claimedRows } = await supabase
    .from("finance_pending_transfers")
    .update({ rejected_at: new Date().toISOString(), rejected_by: sender.id, rejected_reason: reason })
    .eq("id", row.id)
    .is("confirmed_at", null)
    .is("rejected_at", null)
    .select("id, pengajuan_id, proyek, tipe, branch_id, party_name, nominal, admin_email, reference_no");

  if (!claimedRows || claimedRows.length === 0) {
    return { outcome: "not_found", code };
  }
  const claimed = claimedRows[0];
  const nominal = Number(claimed.nominal);

  const { error: syncLogError } = await supabase.from("sync_log").insert({
    direction: "outbound",
    event_type: "finance_expense_transfer_rejected",
    source_table: "finance_pending_transfers",
    source_id: claimed.id,
    idempotency_key: `transfer-rejected-${claimed.pengajuan_id}-${claimed.id}-${crypto.randomUUID()}`,
    payload: {
      pengajuan_id: claimed.pengajuan_id,
      reason,
      rejected_by: sender.name,
    },
  });
  if (syncLogError) {
    // Un-claim so a retry can go through instead of the pengajuan being
    // stuck "rejected" locally with mkh-properti never told.
    await supabase.from("finance_pending_transfers").update({ rejected_at: null, rejected_by: null, rejected_reason: null }).eq("id", claimed.id);
    return { outcome: "sync_failed", error: syncLogError.message };
  }

  const recipients: { name: string; phone: string }[] = [];
  if (claimed.branch_id) {
    const { data: branchKc } = await supabase
      .from("employees")
      .select("full_name, phone, role:role_id(key)")
      .eq("branch_id", claimed.branch_id)
      .not("phone", "is", null)
      .is("deleted_at", null)
      .eq("employment_status", "active");
    for (const emp of branchKc ?? []) {
      if ((emp.role as unknown as { key: string } | null)?.key === "kepala_cabang" && emp.phone) {
        recipients.push({ name: emp.full_name, phone: emp.phone });
      }
    }
  }
  const submitterName = extractSubmitterName(claimed.admin_email);
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
    }
  }

  return {
    outcome: "rejected",
    code: claimed.reference_no ?? code,
    partyName: claimed.party_name,
    nominal,
    reason,
    recipients,
  };
}
