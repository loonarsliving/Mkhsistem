import { createAdminClient } from "@/lib/supabase/admin";

/** Deliberately narrow: only a short, unambiguous "yes" reply counts, so a stray "ya" mid-sentence in an unrelated chat never accidentally approves a fee. */
const APPROVE_PATTERN = /^(ya|iya|y|setuju|approve|ok|oke|sip)[.!]*$/i;

export type LoonarsFeeApprovalOutcome =
  | { outcome: "not_an_approval_command" }
  | { outcome: "no_pending_fee" }
  | { outcome: "approved"; feeId: number; unit: string | null; buyer: string | null; feeAmount: number | null };

/**
 * Temporary stand-in for the CFO's approval on MKH Property's
 * /verifikasi.html: while that page isn't staffed, a Super Admin can just
 * reply "ya"/"setuju" on WhatsApp to the fee-claim alert
 * (loonars_fee_submitted) to approve it. FIFO only -- with more than one fee
 * pending, a reply actions the OLDEST undecided one; there's no per-fee
 * disambiguation yet. Enqueues loonars_fee_wa_decision for MKH Property's
 * sync_inbound to post the commission journal entry and mirror the decision
 * onto loonars_fee/pengajuan (same cascade the CFO's own approve click
 * triggers -- sales-target sync + the loonars_fee_decided WhatsApp receipt).
 */
export async function tryApproveLoonarsFeeViaWhatsApp(
  approvedByEmployeeId: string,
  approvedByName: string,
  messageText: string,
): Promise<LoonarsFeeApprovalOutcome> {
  if (!APPROVE_PATTERN.test(messageText.trim())) {
    return { outcome: "not_an_approval_command" };
  }

  const supabase = createAdminClient();
  const { data: pending } = await supabase
    .from("loonars_fee_wa_requests")
    .select("fee_id, unit, buyer, fee_amount")
    .eq("decided", false)
    .order("requested_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return { outcome: "no_pending_fee" };
  }

  // .eq("decided", false) on the update makes this race-safe: if two replies
  // land at once, only one caller's update actually matches a row.
  const { data: updatedRows } = await supabase
    .from("loonars_fee_wa_requests")
    .update({ decided: true, decided_at: new Date().toISOString(), decided_by: approvedByEmployeeId })
    .eq("fee_id", pending.fee_id)
    .eq("decided", false)
    .select("fee_id, unit, buyer, fee_amount");

  if (!updatedRows || updatedRows.length === 0) {
    return { outcome: "no_pending_fee" };
  }
  const row = updatedRows[0];

  await supabase.from("sync_log").insert({
    direction: "outbound",
    event_type: "loonars_fee_wa_decision",
    source_table: "loonars_fee_wa_requests",
    source_id: String(row.fee_id),
    idempotency_key: `wa-fee-decision-${row.fee_id}`,
    payload: { fee_id: row.fee_id, decision: "approved", decided_by: approvedByName },
  });

  return { outcome: "approved", feeId: row.fee_id, unit: row.unit, buyer: row.buyer, feeAmount: row.fee_amount };
}
