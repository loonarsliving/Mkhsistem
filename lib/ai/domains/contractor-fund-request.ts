import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recognizeFundRequestText, type FundRequestItem, type FundRequestKategori, type FundRequestRecognition } from "@/lib/ai/domains/contractor-fund-request-recognition";
import type { Json } from "@/types/database.types";
import { sendWhatsAppText } from "../notifications/engine";

export type ContractorFundRequestOutcome =
  | { outcome: "not_a_request" }
  | { outcome: "needs_more_info"; nominal: number; keterangan: string; missingKategori: boolean; missingRekening: boolean }
  | { outcome: "sync_failed"; error: string }
  | { outcome: "submitted"; nominal: number; keterangan: string; items: FundRequestItem[]; kategori: FundRequestKategori };

/** Detects a bare category answer ("Beli matrial", "gaji tukang") -- deliberately loose, this only ever fires when a pending clarification already exists for this contractor. */
function detectKategoriFromShortReply(text: string): FundRequestKategori | null {
  const lower = text.toLowerCase();
  if (/gaji|upah|tukang/.test(lower)) return "gaji";
  if (/material|bahan|beli/.test(lower)) return "material";
  return null;
}

/** A bare rekening answer needs at least one real account-number-length digit run -- otherwise a short reply like "iya" or "material" could get misread as an account. */
function detectRekeningFromReply(text: string): string | null {
  const trimmed = text.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  return digitsOnly.length >= 8 ? trimmed.slice(0, 150) : null;
}

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

/** A pending clarification older than this is treated as stale/abandoned rather than completed by an unrelated later message. */
const PENDING_CLARIFICATION_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/**
 * Exported so contractor-expense-report.ts can post the SAME kind of
 * pengajuan when a contractor answers "REIMBURSE" to a nota photo --
 * nota-derived reimbursements are always material purchases from a
 * store, so that caller always passes kategori "material" directly
 * instead of asking a second clarifying question nota photos already
 * answer by what they are.
 *
 * Owner's fix: a contractor's request never carried a destination bank
 * account at all -- only category was ever asked -- so keterangan (which
 * becomes finance_pending_transfers.rekening_tujuan once approved) had
 * nothing for the bukti-transfer auto-matching to compare against, the
 * same class of bug that caused an unrelated Rp 5.000.000 pengajuan to
 * get wrongly auto-confirmed earlier. `rekening` is optional here only so
 * a caller with no better source (e.g. a REIMBURSE conversion with
 * nothing else to go on) can still submit -- tryHandleContractorFundRequest
 * itself always resolves one (from the message or contractor_wa_senders.bank_account)
 * before calling this, never submitting blind.
 */
export async function submitFundRequest(
  contractor: { id: string; fullName: string },
  nominal: number,
  items: FundRequestItem[],
  keterangan: string,
  kategori: FundRequestKategori,
  aiNotes: string | null,
  rekening?: string | null,
): Promise<ContractorFundRequestOutcome> {
  const { jenisAkun, jenisNama } = AKUN_BY_KATEGORI[kategori];
  const supabase = createAdminClient();
  const idempotencyKey = `contractor-fund-request-${contractor.id}-${Date.now()}-${crypto.randomUUID()}`;

  let resolvedRekening = rekening ?? null;
  if (!resolvedRekening) {
    const { data: contractorRow } = await supabase.from("contractor_wa_senders").select("bank_account").eq("id", contractor.id).maybeSingle();
    resolvedRekening = contractorRow?.bank_account ?? null;
  } else {
    // Remember it for next time -- he shouldn't have to repeat his account on every future request.
    await supabase.from("contractor_wa_senders").update({ bank_account: resolvedRekening }).eq("id", contractor.id);
  }
  const keteranganWithRekening = resolvedRekening ? `${resolvedRekening} | ${keterangan}` : keterangan;

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
      nominal,
      keterangan: keteranganWithRekening,
      jenis_akun: jenisAkun,
      jenis_nama: jenisNama,
      pengawas: contractor.fullName,
      created_by_label: `Kontraktor: ${contractor.fullName}`,
      sumber: "whatsapp_contractor_request",
      ai_notes: aiNotes,
    },
  });

  if (error) {
    return { outcome: "sync_failed", error: error.message };
  }
  return { outcome: "submitted", nominal, keterangan, items, kategori };
}

/**
 * Owner's ask: Anang can request a fund advance himself on WhatsApp, in
 * his own words -- no rigid command syntax, just explaining what he needs
 * and how much. AI reads whether the message is a genuine request,
 * extracts EVERY item he listed with its own value (not one combined
 * summary -- same bar as a nota photo's breakdown), whether it's gaji
 * (upah tukang, paid weekly on Saturdays) or material, and his
 * destination bank account -- never guessed: a missing category or a
 * missing account (with nothing already on file from an earlier request)
 * returns needs_more_info so the caller asks him outright instead of
 * miscategorizing real bookkeeping or submitting a pengajuan nobody can
 * actually transfer money against. Once both are known, it becomes a
 * pengajuan through the SAME pipeline Endy's own requests already use
 * (tipe='bahan', jenis Biaya Upah Tukang/5-1003 or Pembelian
 * Material/5-1001) -- Vando still has to judge and approve it
 * (verifikasi.html or WhatsApp) before Super Admin transfers anything.
 * Reuses mkh-properti's material_expense_receipt_submitted sync_inbound
 * event (0027/0028/0029) since the resulting pengajuan is identical in
 * shape to a nota-derived one; `sumber` distinguishes this as a
 * contractor-initiated request rather than an AI-read nota.
 *
 * Real incident: Anang answered "REIMBURSE uang belanja sebesar Rp.
 * 2.031.000" -> got asked to clarify gaji/material -> replied "Beli
 * matrial" (no nominal restated) -> that short reply alone had nothing for
 * recognizeFundRequestText to read as a request, so it fell all the way
 * through to the generic "kirim foto nota / jelaskan kebutuhan dana" canned
 * reply, as if he'd never said anything about Rp 2.031.000 at all. Checks
 * contractor_fund_request_pending first: if this contractor has an
 * unresolved clarification from the last few hours, a bare category or
 * account-number reply completes whichever piece(s) it answers instead of
 * requiring him to retype everything.
 */
export async function tryHandleContractorFundRequest(contractor: { id: string; fullName: string }, text: string): Promise<ContractorFundRequestOutcome> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { outcome: "not_a_request" };
  }

  const supabase = createAdminClient();

  const { data: contractorRow } = await supabase.from("contractor_wa_senders").select("bank_account").eq("id", contractor.id).maybeSingle();
  const knownRekening = contractorRow?.bank_account ?? null;

  const { data: pendingRows } = await supabase
    .from("contractor_fund_request_pending")
    .select("id, nominal, items, keterangan, ai_notes, kategori, rekening, created_at")
    .eq("contractor_id", contractor.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const pending = pendingRows?.[0];

  if (pending && Date.now() - new Date(pending.created_at).getTime() <= PENDING_CLARIFICATION_MAX_AGE_MS) {
    const kategoriFromReply = detectKategoriFromShortReply(trimmed);
    const rekeningFromReply = detectRekeningFromReply(trimmed);
    const kategori = (pending.kategori as FundRequestKategori | null) ?? kategoriFromReply;
    const rekening = pending.rekening ?? rekeningFromReply ?? knownRekening;

    if (kategori && rekening) {
      await supabase.from("contractor_fund_request_pending").delete().eq("id", pending.id);
      return submitFundRequest(contractor, Number(pending.nominal), pending.items as unknown as FundRequestItem[], pending.keterangan, kategori, pending.ai_notes, rekening);
    }

    if (kategoriFromReply || rekeningFromReply) {
      await supabase
        .from("contractor_fund_request_pending")
        .update({ kategori, rekening: pending.rekening ?? rekeningFromReply })
        .eq("id", pending.id);
      return { outcome: "needs_more_info", nominal: Number(pending.nominal), keterangan: pending.keterangan, missingKategori: !kategori, missingRekening: !rekening };
    }
    // Reply didn't answer either missing piece -- fall through to fresh recognition below.
  }

  const ai: FundRequestRecognition = await recognizeFundRequestText(trimmed).catch(
    (): FundRequestRecognition => ({ isRequest: false, items: [], nominal: null, kategori: null, rekening: null, notes: "Analisa AI gagal." }),
  );

  if (!ai.isRequest || ai.nominal === null) {
    return { outcome: "not_a_request" };
  }

  // Fall back to a single pseudo-item (the whole message) when he only gave
  // one lump-sum total with no per-item breakdown -- still lets the
  // request through, just without a line-by-line list to show Vando.
  const items: FundRequestItem[] = ai.items.length > 0 ? ai.items : [{ nama: trimmed.slice(0, 200), harga: ai.nominal }];
  const keterangan = formatItemSummary(items);
  const rekening = ai.rekening ?? knownRekening;

  if (ai.kategori === null || !rekening) {
    // Replace any earlier unresolved clarification from this contractor --
    // this newer request is what a follow-up answer should complete.
    await supabase.from("contractor_fund_request_pending").delete().eq("contractor_id", contractor.id);
    await supabase.from("contractor_fund_request_pending").insert({
      contractor_id: contractor.id,
      nominal: ai.nominal,
      items: items as unknown as Json,
      keterangan,
      ai_notes: ai.notes,
      kategori: ai.kategori,
      rekening: ai.rekening,
    });
    return { outcome: "needs_more_info", nominal: ai.nominal, keterangan, missingKategori: ai.kategori === null, missingRekening: !rekening };
  }

  if (pending) {
    await supabase.from("contractor_fund_request_pending").delete().eq("id", pending.id);
  }
  return submitFundRequest(contractor, ai.nominal, items, keterangan, ai.kategori, ai.notes, rekening);
}

/**
 * Real incident: asked Anang directly (a one-off WA message, not tied to
 * any live fund request) to send his bank account -- he replied with just
 * "Bank BCA 037-301-1441 A.n Anang Setiyatno Wibowo", no item/nominal
 * attached. tryHandleContractorFundRequest correctly read that as
 * not_a_request (nothing to submit), so the caller fell through to the
 * generic "kirim foto nota / jelaskan kebutuhan dana" reply -- his account
 * number was silently dropped instead of saved.
 *
 * Caller (webhook-handler.ts) invokes this ONLY as a fallback after
 * tryHandleContractorFundRequest itself found nothing to do with the
 * message, so it never preempts a real fund request or pending-clarification
 * answer (both already handle rekening in-line). Fires only when the
 * message reads as essentially just an account number -- the same
 * digit-length heuristic already used for a pending clarification's
 * rekening answer.
 */
export async function tryCaptureContractorBankAccount(contractor: { id: string }, text: string): Promise<{ outcome: "captured"; rekening: string } | { outcome: "not_applicable" }> {
  const rekening = detectRekeningFromReply(text);
  if (!rekening) {
    return { outcome: "not_applicable" };
  }
  const supabase = createAdminClient();
  await supabase.from("contractor_wa_senders").update({ bank_account: rekening }).eq("id", contractor.id);
  return { outcome: "captured", rekening };
}

/** Matches a contractor trying to correct/cancel something he already sent -- "Ralat sudah dimasukan. Hapus", "batal", "salah input", "keliru". Deliberately loose since the only cost of a false positive is an extra manual-review ping to Vando/Super Admin. */
const CORRECTION_PATTERN = /\b(ralat|batal(?:kan)?|dibatalkan|hapus(?:kan)?|keliru|salah\s*(?:kirim|input|masuk))\b/i;

/**
 * Real incident: Anang submitted a near-duplicate nota by mistake (kuar 2"
 * then kuar 2.5", one minute apart), realized it, and replied "Ralat sudah
 * dimasukan. Hapus" -- but nothing in the pipeline recognized a
 * correction/cancellation message at all, so it fell through every check
 * here and landed on the generic "kirim foto nota / jelaskan kebutuhan
 * dana" canned reply, silently dropping his correction. The duplicate then
 * sat un-flagged until Super Admin caught it manually days later.
 *
 * This never auto-cancels anything against real financial records -- a
 * contractor's own claim of "salah" isn't enough to safely delete a
 * pengajuan or report on its own. Instead it forwards his exact message to
 * every Super Admin and Kepala Cabang so a human decides what to actually
 * cancel/reject, and tells the contractor it was forwarded so he isn't left
 * thinking he was ignored again.
 *
 * Caller (webhook-handler.ts) invokes this as a fallback, same tier as
 * tryCaptureContractorBankAccount -- only after every other check found
 * nothing to do with the message, so it never preempts a real fund request,
 * pending-clarification answer, or settlement-type reply.
 */
export async function tryForwardContractorCorrectionRequest(
  contractor: { id: string; fullName: string },
  text: string,
): Promise<{ outcome: "forwarded" } | { outcome: "not_applicable" }> {
  const trimmed = text.trim();
  if (!CORRECTION_PATTERN.test(trimmed)) {
    return { outcome: "not_applicable" };
  }

  const supabase = createAdminClient();
  const { data: reviewers } = await supabase
    .from("employees")
    .select("phone, role:role_id(key)")
    .not("phone", "is", null)
    .is("deleted_at", null)
    .eq("employment_status", "active");
  const reviewerPhones = (reviewers ?? [])
    .filter((e) => ["super_admin", "kepala_cabang"].includes((e.role as unknown as { key: string } | null)?.key ?? ""))
    .map((e) => e.phone as string);

  const message = `⚠️ ${contractor.fullName} mengirim pesan koreksi/pembatalan via WhatsApp, tapi sistem belum bisa memprosesnya otomatis -- tolong cek manual:\n\n"${trimmed}"`;
  for (const phone of reviewerPhones) {
    await sendWhatsAppText(phone, message);
  }

  return { outcome: "forwarded" };
}
