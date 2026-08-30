import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeExpenseReceipt, type ExpenseReceiptRecognition } from "@/lib/ai/domains/expense-receipt-recognition";
import { submitFundRequest, type ContractorFundRequestOutcome } from "@/lib/ai/domains/contractor-fund-request";
import type { FundRequestItem } from "@/lib/ai/domains/contractor-fund-request-recognition";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";
import { sendWhatsAppText } from "../notifications/engine";

export interface ContractorSender {
  id: string;
  fullName: string;
  phone: string;
}

/** Keeps only digits, for tolerant matching (leading 0 vs 62, spaces, dashes) -- same approach as webhook-handler.ts's findEmployeeByPhone. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Anang, currently the only row -- matched by last 9 digits, same tolerance as employees.phone matching. */
export async function findContractorByPhone(sender: string): Promise<ContractorSender | null> {
  const senderDigits = digitsOnly(sender);
  const suffix = senderDigits.slice(-9);
  if (suffix.length < 9) return null;

  const supabase = createAdminClient();
  const { data } = await supabase.from("contractor_wa_senders").select("id, full_name, phone");
  const match = (data ?? []).find((row) => digitsOnly(row.phone).endsWith(suffix));
  return match ? { id: match.id, fullName: match.full_name, phone: match.phone } : null;
}

async function findVando(): Promise<{ id: string; fullName: string; phone: string | null } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, phone")
    .ilike("full_name", "%vando%")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .limit(1);
  const vando = data?.[0];
  return vando ? { id: vando.id, fullName: vando.full_name, phone: vando.phone } : null;
}

export type ContractorReportSubmissionOutcome =
  | { outcome: "unreadable" }
  | { outcome: "awaiting_settlement_type"; code: string; itemSummary: string; nominal: number; ai: ExpenseReceiptRecognition; duplicateOfCode: string | null };

/** "Semen 5 sak (Rp 500.000); Paku 2kg (Rp 50.000)" -- same joined-text convention material-receipt-submission.ts uses for mkh-properti's pengajuan.item. */
function formatItemSummary(items: { nama: string; harga: number }[]): string {
  return items.map((it) => `${it.nama} (Rp ${it.harga.toLocaleString("id-ID")})`).join("; ");
}

/** A duplicate/retake of the same nota reads as the same total split into the same per-item values -- item NAMES can differ slightly (OCR/retyping, e.g. "kuar 2\"" vs "kuar 2.5\""), so only the harga multiset has to match, not the wording. */
function sameItemValues(a: { harga: number }[], b: { harga: number }[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a.map((it) => it.harga)].sort((x, y) => x - y);
  const sortedB = [...b.map((it) => it.harga)].sort((x, y) => x - y);
  return sortedA.every((value, i) => value === sortedB[i]);
}

/** A duplicate/retake almost always follows within minutes of the original -- widening this risks flagging two genuinely separate same-total purchases days apart as duplicates. */
const DUPLICATE_REPORT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Real incident: Anang submitted a near-duplicate nota one minute after the
 * first (same 3 items/values, same Rp 27.000 total, one item name reads
 * "kuar 2\"" the first time and "kuar 2.5\"" the second) -- nothing flagged
 * it, and the duplicate sat un-caught for days until Super Admin found it
 * manually. Checked against this contractor's own recent reports (not yet
 * rejected -- a report already rejected as a caught duplicate shouldn't
 * itself trigger new "duplicate of a duplicate" warnings) before a new one
 * is inserted. Returns the earlier report's code when found; the caller
 * still creates the new report either way (a real photo is never dropped),
 * just flags it prominently to both the contractor and Vando instead of
 * letting it through silently.
 */
async function findLikelyDuplicateReport(contractorId: string, nominal: number, items: { harga: number }[]): Promise<string | null> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - DUPLICATE_REPORT_WINDOW_MS).toISOString();
  const { data: recent } = await supabase
    .from("contractor_expense_reports")
    .select("id, nominal, items, created_at")
    .eq("contractor_id", contractorId)
    .neq("status", "rejected")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  for (const candidate of recent ?? []) {
    if (Number(candidate.nominal) !== nominal) continue;
    const candidateItems = Array.isArray(candidate.items) ? (candidate.items as { nama: string; harga: number }[]) : [];
    if (sameItemValues(candidateItems, items)) {
      return `LAP-${String(candidate.id).padStart(4, "0")}`;
    }
  }
  return null;
}

/**
 * Anang (or any future row in contractor_wa_senders) sending a nota photo.
 * Deliberately does NOT touch mkh-properti or post anything to a ledger,
 * and deliberately does NOT notify Vando yet -- it only records the nota
 * with settlement_type left null.
 *
 * Real incident this replaced: a nota photo used to go straight to Vando
 * as a "laporan" (documentation against an advance already transferred)
 * the instant it arrived, with nobody ever asking whether it actually was
 * that or a REIMBURSE (money the company hasn't paid yet, needs its own
 * pengajuan). Anang's own later "REIMBURSE Rp 2.031.000" text had nowhere
 * to attach to, and the report had already gone out to Vando as a laporan
 * to match against an advance it was never meant to be matched against.
 * See tryResolveContractorReportSettlementType, which the caller must
 * invoke on his next text reply to actually release these to Vando (as
 * pelaporan) or convert them into a pengajuan (as reimburse).
 */
export async function trySubmitContractorReceiptReport(contractor: ContractorSender, imageUrl: string): Promise<ContractorReportSubmissionOutcome> {
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
  const duplicateOfCode = await findLikelyDuplicateReport(contractor.id, ai.nominal, ai.items);
  const duplicateOfId = duplicateOfCode ? Number(duplicateOfCode.replace("LAP-", "")) : null;

  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase
    .from("contractor_expense_reports")
    .insert({
      contractor_id: contractor.id,
      contractor_name: contractor.fullName,
      contractor_phone: contractor.phone,
      item: itemSummary,
      items: ai.items as unknown as Json,
      nominal: ai.nominal,
      tanggal: ai.tanggal,
      supplier: ai.supplier,
      ai_notes: ai.notes,
      duplicate_of_id: duplicateOfId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { outcome: "unreadable" };
  }

  const code = `LAP-${String(inserted.id).padStart(4, "0")}`;
  return { outcome: "awaiting_settlement_type", code, itemSummary, nominal: ai.nominal, ai, duplicateOfCode };
}

export type CancelOwnReportOutcome = { outcome: "not_applicable" } | { outcome: "not_found"; code: string } | { outcome: "already_resolved"; code: string } | { outcome: "cancelled"; code: string };

/**
 * Real incident: Anang tried to self-correct a duplicate nota by replying
 * "Ralat sudah dimasukan. Hapus" -- unrecognized, so it fell through to the
 * generic canned reply and the duplicate sat un-caught for days. This
 * handles an explicit "RALAT LAP-0001" / "BATAL LAP-0001" reply referencing
 * a specific code (the duplicate-detection reply above teaches him this
 * exact syntax). Only cancels a report that's STILL "pending" with no
 * settlement_type decided yet -- once it's been sent to Vando as a
 * pelaporan or converted into a reimburse pengajuan, there's a real
 * financial record downstream a bare WA claim of "salah kirim" can't safely
 * delete on its own; tryForwardContractorCorrectionRequest (in
 * contractor-fund-request.ts) is the fallback for that case, flagging
 * Vando/Super Admin for manual review instead of auto-cancelling.
 */
export async function tryCancelOwnPendingReport(contractor: ContractorSender, text: string): Promise<CancelOwnReportOutcome> {
  const match = text.trim().match(/^(?:ralat|batal(?:kan)?|hapus(?:kan)?)\s+(lap-\d+)\b/i);
  if (!match) {
    return { outcome: "not_applicable" };
  }
  const code = match[1].toUpperCase();
  const idMatch = code.match(/^LAP-(\d+)$/);
  const reportId = idMatch ? Number(idMatch[1]) : null;
  if (reportId === null) {
    return { outcome: "not_found", code };
  }

  const supabase = createAdminClient();
  const { data: cancelled } = await supabase
    .from("contractor_expense_reports")
    .update({ status: "rejected", reject_reason: "Dibatalkan sendiri oleh kontraktor via WhatsApp (duplikat/salah kirim)" })
    .eq("id", reportId)
    .eq("contractor_id", contractor.id)
    .eq("status", "pending")
    .is("settlement_type", null)
    .select("id")
    .maybeSingle();

  if (cancelled) {
    return { outcome: "cancelled", code };
  }

  const { data: existing } = await supabase.from("contractor_expense_reports").select("id").eq("id", reportId).eq("contractor_id", contractor.id).maybeSingle();
  return existing ? { outcome: "already_resolved", code } : { outcome: "not_found", code };
}

function detectSettlementType(text: string): "reimburse" | "pelaporan" | null {
  const lower = text.toLowerCase();
  if (/reimburse|ganti\s*uang|belum\s*(di)?\s*bayar|belum\s*dibayar/.test(lower)) return "reimburse";
  if (/pelapor|sudah\s*(di)?\s*bayar|uang\s*muka|advance/.test(lower)) return "pelaporan";
  return null;
}

export type ContractorReportSettlementOutcome =
  | { outcome: "no_pending" }
  | { outcome: "awaiting_answer"; codes: string[] }
  | { outcome: "sent_as_pelaporan"; codes: string[]; nominal: number }
  | { outcome: "converted_to_reimburse"; nominal: number; fundResult: ContractorFundRequestOutcome };

/**
 * Handles a contractor's text reply that answers the reimburse/pelaporan
 * question asked right after his nota photo(s) were received. Resolves
 * EVERY one of his still-unclassified reports at once (not just the
 * latest), matching how Anang actually used it: several nota sent back to
 * back, one combined answer covering all of them.
 */
export async function tryResolveContractorReportSettlementType(contractor: ContractorSender, text: string): Promise<ContractorReportSettlementOutcome> {
  const supabase = createAdminClient();
  const { data: pendingReports } = await supabase
    .from("contractor_expense_reports")
    .select("id, item, items, nominal, tanggal, supplier, ai_notes, duplicate_of_id")
    .eq("contractor_id", contractor.id)
    .eq("status", "pending")
    .is("settlement_type", null)
    .order("created_at", { ascending: true });

  if (!pendingReports || pendingReports.length === 0) {
    return { outcome: "no_pending" };
  }

  const codes = pendingReports.map((r) => `LAP-${String(r.id).padStart(4, "0")}`);
  const settlementType = detectSettlementType(text);
  if (!settlementType) {
    return { outcome: "awaiting_answer", codes };
  }

  const reportIds = pendingReports.map((r) => r.id);

  if (settlementType === "pelaporan") {
    await supabase.from("contractor_expense_reports").update({ settlement_type: "pelaporan" }).in("id", reportIds);

    const vando = await findVando();
    if (vando?.phone) {
      for (const report of pendingReports) {
        const code = `LAP-${String(report.id).padStart(4, "0")}`;
        const items = Array.isArray(report.items) ? (report.items as { nama: string; harga: number }[]) : [];
        const itemLines = items.length > 0 ? items.map((it) => `🧾 ${it.nama} - Rp ${it.harga.toLocaleString("id-ID")}`).join("\n") : `🧾 ${report.item}`;
        const duplicateWarning = report.duplicate_of_id
          ? `\n\n⚠️ *Kemungkinan duplikat* dari LAP-${String(report.duplicate_of_id).padStart(4, "0")} (item dan total sama, dikirim dalam 1 jam terakhir). Cek dulu sebelum COCOK.`
          : "";
        await sendWhatsAppText(
          vando.phone,
          `📋 Laporan belanja *${contractor.fullName}* (${code})${report.supplier ? ` — ${report.supplier}` : ""}:\n${itemLines}\n💰 Total: Rp ${Number(report.nominal).toLocaleString("id-ID")}${report.tanggal ? `\n📅 ${report.tanggal}` : ""}${duplicateWarning}\n\nCocokkan dengan uang muka yang sudah ditransfer ke ${contractor.fullName}. Balas *COCOK ${code}* kalau sesuai, atau *TOLAK ${code} <alasan>* kalau tidak.`,
        );
      }
    }

    const nominal = pendingReports.reduce((sum, r) => sum + Number(r.nominal), 0);
    return { outcome: "sent_as_pelaporan", codes, nominal };
  }

  // reimburse: never sent to Vando as a laporan -- this is money the
  // company hasn't paid Anang for yet, so it becomes its own pengajuan
  // through the exact same pipeline his own fund requests use. Nota
  // purchases are always store purchases, so kategori is always
  // "material" -- no second clarifying question needed.
  await supabase
    .from("contractor_expense_reports")
    .update({ settlement_type: "reimburse", status: "rejected", reject_reason: "Dikonversi menjadi pengajuan reimburse" })
    .in("id", reportIds);

  const items: FundRequestItem[] = pendingReports.flatMap((r) => (Array.isArray(r.items) ? (r.items as unknown as FundRequestItem[]) : [{ nama: r.item, harga: Number(r.nominal) }]));
  const nominal = pendingReports.reduce((sum, r) => sum + Number(r.nominal), 0);
  const keterangan = formatItemSummary(items);
  const aiNotes = pendingReports.map((r) => r.ai_notes).filter(Boolean).join(" | ") || null;

  const fundResult = await submitFundRequest(contractor, nominal, items, keterangan, "material", aiNotes);
  return { outcome: "converted_to_reimburse", nominal, fundResult };
}

export type ContractorReportDecisionOutcome =
  | { outcome: "not_a_decision" }
  | { outcome: "not_found"; code: string }
  | { outcome: "already_decided"; code: string }
  | { outcome: "decided"; code: string; approved: boolean; contractorName: string; contractorPhone: string };

/**
 * Vando replying "COCOK LAP-0001" or "TOLAK LAP-0001 <alasan>". Documentation
 * only -- flips contractor_expense_reports.status and tells Anang the
 * outcome. Never touches mkh-properti, jurnal, or pengajuan: the expense
 * was already booked when the original advance was approved and
 * transferred, so there is nothing left to post here.
 */
export async function tryDecideContractorReport(decider: { id: string; fullName: string }, text: string): Promise<ContractorReportDecisionOutcome> {
  const match = text.trim().match(/^(COCOK|TOLAK)\s+(LAP-\d+)\b\s*(.*)$/i);
  if (!match) {
    return { outcome: "not_a_decision" };
  }
  const approved = match[1].toUpperCase() === "COCOK";
  const code = match[2].toUpperCase();
  const reason = match[3]?.trim() || null;
  const idMatch = code.match(/^LAP-(\d+)$/);
  const reportId = idMatch ? Number(idMatch[1]) : null;
  if (reportId === null) {
    return { outcome: "not_found", code };
  }

  const supabase = createAdminClient();
  const { data: claimedRows } = await supabase
    .from("contractor_expense_reports")
    .update({
      status: approved ? "approved" : "rejected",
      reviewed_by: decider.id,
      reviewed_at: new Date().toISOString(),
      reject_reason: reason,
    })
    .eq("id", reportId)
    .eq("status", "pending")
    .select("id, contractor_name, contractor_phone");

  if (!claimedRows || claimedRows.length === 0) {
    const { data: existing } = await supabase.from("contractor_expense_reports").select("id").eq("id", reportId).maybeSingle();
    return existing ? { outcome: "already_decided", code } : { outcome: "not_found", code };
  }

  const row = claimedRows[0];
  await sendWhatsAppText(
    row.contractor_phone,
    approved
      ? `✅ Laporan belanja Anda (${code}) sudah dicek dan disetujui ${decider.fullName}.`
      : `⚠️ Laporan belanja Anda (${code}) belum sesuai menurut ${decider.fullName}.${reason ? `\n📝 Alasan: ${reason}` : ""}\nTolong kirim ulang nota yang benar.`,
  );

  if (approved) {
    // Fire-and-forget from the caller's point of view -- a failure here
    // never blocks Vando's own "decided" reply, and unrecapped rows just
    // get picked up by the next approval (recapped_at stays null).
    await recapApprovedReportsToSuperAdmin();
  }

  return { outcome: "decided", code, approved, contractorName: row.contractor_name, contractorPhone: row.contractor_phone };
}

/**
 * Bundles every approved-but-not-yet-recapped contractor_expense_reports
 * row into one WhatsApp message to every active Super Admin, then marks
 * them recapped_at. Called right after tryDecideContractorReport approves a
 * report -- picking up "approved AND recapped_at IS NULL" (not just the
 * one just decided) means any report that failed to recap earlier (e.g. no
 * Super Admin had a phone number at the time) gets swept in automatically
 * on the next approval, instead of being silently lost.
 */
async function recapApprovedReportsToSuperAdmin(): Promise<void> {
  const supabase = createAdminClient();
  const { data: pending } = await supabase
    .from("contractor_expense_reports")
    .select("id, contractor_name, item, items, nominal, tanggal, supplier, duplicate_of_id")
    .eq("status", "approved")
    .is("recapped_at", null)
    .order("created_at", { ascending: true });

  if (!pending || pending.length === 0) return;

  const lines = pending.map((r, i) => {
    const code = `LAP-${String(r.id).padStart(4, "0")}`;
    const items = Array.isArray(r.items) ? (r.items as { nama: string; harga: number }[]) : [];
    const itemLines = items.length > 0 ? items.map((it) => `   🧾 ${it.nama} - Rp ${Number(it.harga).toLocaleString("id-ID")}`).join("\n") : `   🧾 ${r.item}`;
    const duplicateWarning = r.duplicate_of_id ? ` ⚠️ kemungkinan duplikat LAP-${String(r.duplicate_of_id).padStart(4, "0")}` : "";
    return `${i + 1}. ${r.contractor_name}${r.supplier ? ` — ${r.supplier}` : ""} (${code})${duplicateWarning}\n${itemLines}`;
  });
  const total = pending.reduce((sum, r) => sum + Number(r.nominal), 0);
  const message = `📊 Rekap Laporan Belanja Kontraktor (disetujui Vando):\n\n${lines.join("\n")}\n\nTotal: Rp ${total.toLocaleString("id-ID")}`;

  const { data: admins } = await supabase
    .from("employees")
    .select("phone, role:role_id(key)")
    .not("phone", "is", null)
    .is("deleted_at", null)
    .eq("employment_status", "active");
  const superAdminPhones = (admins ?? [])
    .filter((e) => (e.role as unknown as { key: string } | null)?.key === "super_admin" && e.phone)
    .map((e) => e.phone as string);

  if (superAdminPhones.length === 0) return;

  let anySent = false;
  for (const phone of superAdminPhones) {
    const result = await sendWhatsAppText(phone, message);
    if (result.success) anySent = true;
  }

  if (anySent) {
    await supabase
      .from("contractor_expense_reports")
      .update({ recapped_at: new Date().toISOString() })
      .in(
        "id",
        pending.map((r) => r.id),
      );
  }
}
