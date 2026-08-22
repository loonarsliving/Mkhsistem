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
    }
  | {
      outcome: "confirmed_group";
      items: { partyName: string | null; nominal: number }[];
      totalNominal: number;
      ai: TransferProofRecognition;
      recipients: { name: string; phone: string }[];
      failedItem?: { partyName: string | null; error: string };
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

type Supa = ReturnType<typeof createAdminClient>;

/** Branch's Kepala Cabang + whoever actually submitted the pengajuan (falling back to Endy when unattributed). */
async function resolveRecipients(supabase: Supa, branchId: string | null, adminEmail: string | null): Promise<{ name: string; phone: string }[]> {
  const recipients: { name: string; phone: string }[] = [];
  if (branchId) {
    const { data: branchKc } = await supabase
      .from("employees")
      .select("full_name, phone, role:role_id(key)")
      .eq("branch_id", branchId)
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
  const submitterName = extractSubmitterName(adminEmail);
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
  return recipients;
}

type PendingRow = {
  id: string;
  pengajuan_id: number;
  proyek: string;
  tipe: "bahan" | "tukang";
  branch_id: string | null;
  party_name: string | null;
  nominal: number | string;
  admin_email: string | null;
  rekening_tujuan: string | null;
};

const PENDING_ROW_COLUMNS = "id, pengajuan_id, proyek, tipe, branch_id, party_name, nominal, admin_email, rekening_tujuan";

/**
 * Bank account numbers are the longest run of digits in a destination-account
 * string (e.g. "BCA 6975175212 endy septianto" -> "6975175212"). Used to
 * compare the pengajuan's own destination account against whatever the AI
 * read off the bukti transfer photo -- free text on both sides, so exact
 * string equality would almost never match, but the account number itself
 * should.
 *
 * m-banking receipts often print the account number split into groups by a
 * single space (e.g. "6975 1752 12" for "6975175212") -- matches those
 * space-separated digit groups as one run and joins them back together,
 * instead of only matching an unbroken run of 6+ digits, which would miss
 * every group individually (real case: "ENDY SEPTIANTO BCA 6975 1752 12"
 * read no account at all under the old digits-only-no-spaces regex).
 */
function extractAccountDigits(text: string | null): string | null {
  if (!text) return null;
  const runs = text.match(/\d+(?: \d+)*/g);
  if (!runs || runs.length === 0) return null;
  let longest = "";
  for (const run of runs) {
    const joined = run.replace(/ /g, "");
    if (joined.length >= 6 && joined.length > longest.length) longest = joined;
  }
  return longest || null;
}

/** Inserts the outbound sync_log event for one pengajuan; on failure, un-claims that row so it's retryable. */
async function syncConfirmedRow(supabase: Supa, row: PendingRow, imageUrl: string, ai: TransferProofRecognition, sender: { id: string; name: string }): Promise<string | null> {
  const { error } = await supabase.from("sync_log").insert({
    direction: "outbound",
    event_type: "finance_expense_transfer_confirmed",
    source_table: "finance_pending_transfers",
    source_id: row.id,
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
  if (error) {
    await supabase.from("finance_pending_transfers").update({ confirmed_at: null, confirmed_by: null }).eq("id", row.id);
    return error.message;
  }
  return null;
}

/**
 * Confirms a single pending transfer whose own nominal matched the photo.
 */
async function confirmSingleRow(
  supabase: Supa,
  target: PendingRow,
  sender: { id: string; name: string },
  imageUrl: string,
  ai: TransferProofRecognition,
  matchedByAmount: boolean,
): Promise<TransferProofConfirmationOutcome> {
  const { data: claimedRows } = await supabase
    .from("finance_pending_transfers")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: sender.id })
    .eq("id", target.id)
    .is("confirmed_at", null)
    .is("rejected_at", null)
    .select(PENDING_ROW_COLUMNS);

  if (!claimedRows || claimedRows.length === 0) {
    return { outcome: "no_pending_transfer" };
  }
  const row = claimedRows[0] as PendingRow;
  const nominal = Number(row.nominal);

  const syncError = await syncConfirmedRow(supabase, row, imageUrl, ai, sender);
  if (syncError) {
    return { outcome: "sync_failed", error: syncError };
  }

  const recipients = await resolveRecipients(supabase, row.branch_id, row.admin_email);

  return {
    outcome: "confirmed",
    tipe: row.tipe,
    partyName: row.party_name,
    nominal,
    ai,
    mismatch: isNominalMismatch(nominal, ai.nominal),
    matchedByAmount,
    recipients,
  };
}

/**
 * Confirms every pending transfer in a same-submitter group at once, for
 * when the pengajuan being reimbursed were paid out of the submitter's own
 * pocket in cash and get topped up in one lump transfer instead of one
 * transfer per pengajuan (e.g. Endy fronting several gaji tukang payments).
 * Each pengajuan still posts its own jurnal entry at its own nominal --
 * the group only affects which items get marked confirmed together, not
 * how the money is recorded.
 */
async function confirmGroup(supabase: Supa, group: PendingRow[], sender: { id: string; name: string }, imageUrl: string, ai: TransferProofRecognition): Promise<TransferProofConfirmationOutcome> {
  const ids = group.map((r) => r.id);
  const { data: claimedRows } = await supabase
    .from("finance_pending_transfers")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: sender.id })
    .in("id", ids)
    .is("confirmed_at", null)
    .is("rejected_at", null)
    .select(PENDING_ROW_COLUMNS);

  if (!claimedRows || claimedRows.length !== ids.length) {
    // Someone else claimed part of the group between reading and writing --
    // un-claim whatever we did get so nothing is left half-confirmed, and
    // let Super Admin retry (single-row matching still applies per pengajuan).
    for (const row of claimedRows ?? []) {
      await supabase.from("finance_pending_transfers").update({ confirmed_at: null, confirmed_by: null }).eq("id", row.id);
    }
    return { outcome: "sync_failed", error: "Konflik saat mengklaim beberapa pengajuan sekaligus (mungkin ada yang baru saja diproses). Coba kirim ulang fotonya." };
  }
  const rows = claimedRows as PendingRow[];

  const confirmed: PendingRow[] = [];
  let failedItem: { partyName: string | null; error: string } | undefined;
  for (const row of rows) {
    const syncError = await syncConfirmedRow(supabase, row, imageUrl, ai, sender);
    if (syncError) {
      failedItem = { partyName: row.party_name, error: syncError };
      break;
    }
    confirmed.push(row);
  }

  if (confirmed.length === 0) {
    return { outcome: "sync_failed", error: failedItem?.error ?? "Gagal mencatat semua pengajuan dalam grup." };
  }

  const recipients = await resolveRecipients(supabase, confirmed[0].branch_id, confirmed[0].admin_email);

  return {
    outcome: "confirmed_group",
    items: confirmed.map((r) => ({ partyName: r.party_name, nominal: Number(r.nominal) })),
    totalNominal: confirmed.reduce((sum, r) => sum + Number(r.nominal), 0),
    ai,
    recipients,
    failedItem,
  };
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
 * IS readable but its nominal doesn't match any single pending row, it
 * tries one more thing before giving up: does the nominal match the SUM of
 * every still-pending item from one submitter? (Owner's real case: Endy
 * fronts several gaji tukang payments in cash and gets reimbursed in one
 * lump transfer instead of one per pengajuan.) Only ever auto-groups by
 * submitter -- never guesses an arbitrary subset that happens to add up,
 * and never groups across two different submitters -- so a coincidental
 * sum match doesn't silently confirm the wrong combination of pengajuan.
 * If nothing matches even that, this used to still confirm the oldest
 * pending row anyway (mismatch surfaced only as a non-blocking warning) --
 * in practice that meant an unrelated photo (e.g. a PLN token receipt sent
 * by mistake) would get silently attached to whatever pengajuan happened
 * to be first in the queue, real money example: Rp 503.500 token listrik
 * receipt auto-confirmed a Rp 76.343 ongkir pengajuan it had nothing to do
 * with. Now a readable-but-unmatched nominal returns no_amount_match
 * instead of guessing -- Super Admin has to say which pengajuan it's
 * actually for (or resend the right photo).
 */
export async function tryConfirmTransferProofViaWhatsApp(
  sender: { id: string; name: string; roleKey: string | null },
  imageUrl: string,
): Promise<TransferProofConfirmationOutcome> {
  if (sender.roleKey !== "super_admin") {
    return { outcome: "not_super_admin" };
  }

  const supabase = createAdminClient();
  const { data: pendingRowsRaw } = await supabase
    .from("finance_pending_transfers")
    .select(PENDING_ROW_COLUMNS)
    .is("confirmed_at", null)
    .is("rejected_at", null)
    .order("created_at", { ascending: true });
  const pendingRows = pendingRowsRaw as PendingRow[] | null;

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

  if (!ai.readable || ai.nominal === null) {
    // Genuinely nothing to go on -- FIFO is the only sane fallback.
    return confirmSingleRow(supabase, pendingRows[0], sender, imageUrl, ai, false);
  }

  const amountMatches = pendingRows.filter((p) => !isNominalMismatch(Number(p.nominal), ai.nominal));
  if (amountMatches.length > 0) {
    return confirmSingleRow(supabase, amountMatches[0], sender, imageUrl, ai, true);
  }

  // Groups by the pengajuan's own destination account, not who submitted
  // it -- a Kepala Cabang can submit on someone else's behalf, but the
  // money only ever lands in one specific account, and that's what a
  // single lump transfer is actually reimbursing. Requires the photo's own
  // account to be readable -- without it there's nothing trustworthy to
  // group by, so this falls straight through to no_amount_match instead of
  // grouping on sum alone (which could coincidentally match an unrelated
  // combination of pending items).
  const aiAccount = extractAccountDigits(ai.rekeningTujuan);
  if (aiAccount) {
    const sameAccountRows = pendingRows.filter((row) => extractAccountDigits(row.rekening_tujuan) === aiAccount);
    const sum = sameAccountRows.reduce((s, r) => s + Number(r.nominal), 0);
    if (sameAccountRows.length >= 2 && !isNominalMismatch(sum, ai.nominal)) {
      return confirmGroup(supabase, sameAccountRows, sender, imageUrl, ai);
    }
  }

  return {
    outcome: "no_amount_match",
    readNominal: ai.nominal,
    candidates: pendingRows.map((p) => ({ partyName: p.party_name, nominal: Number(p.nominal) })),
  };
}
