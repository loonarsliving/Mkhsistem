"use server";

import { revalidatePath } from "next/cache";

import { normalizeIndonesianPhone } from "@/features/messaging/schemas/messaging.schema";
import { sendWhatsAppImage, sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  assignSiteplanUnitToRow,
  createNotaris,
  createSiteplanProject,
  createSiteplanUnit,
  deleteSiteplanRow,
  deleteSiteplanUnit,
  getAkadScheduleForPurchase,
  getBookingReceiptForPurchase,
  getMyCommissionRate,
  getSiteplanProject,
  getSiteplanPurchaseById,
  getSiteplanPurchaseForUnit,
  listCommissionRates,
  listMySiteplanFeeRequests,
  listMySiteplanPurchases,
  listNotaris,
  listPendingSiteplanFeeRequests,
  listPendingSiteplanPurchases,
  listSiteplanProjects,
  listSiteplanUnits,
  saveCommissionRate,
  saveSiteplanRowOrdering,
  updateNotaris,
  updateSiteplanProject,
  updateSiteplanUnit,
} from "@/repositories/loonars-siteplan.repository";
import { getSignedUrl } from "@/services/storage.service";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  akadScheduleConfirmSchema,
  commissionRateSchema,
  notarisContactSchema,
  siteplanDpFollowupSchema,
  siteplanProjectSchema,
  siteplanPurchaseSchema,
  siteplanUnitSchema,
  akadScheduleRequestSchema,
  type AkadScheduleConfirmInput,
  type AkadScheduleRequestInput,
  type CommissionRateInput,
  type NotarisContactInput,
  type SiteplanDpFollowupInput,
  type SiteplanProjectInput,
  type SiteplanPurchaseInput,
  type SiteplanUnitInput,
} from "../schemas/siteplan.schema";

const VIEWER_PATH = "/siteplan";
const FINANCE_PATH = "/crm/finance";
const DASHBOARD_PATH = "/dashboard";
const ADMIN_PATH = "/siteplan/admin";
const RECEIPT_PATH = (purchaseId: string) => `/siteplan/kwitansi/${purchaseId}`;

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

export async function listSiteplanProjectsAction() {
  await requireSession();
  const supabase = await createClient();
  return listSiteplanProjects(supabase);
}

/** Everything the grid viewer needs for one project: the project itself and its units, already ordered by row_label/sort_order/blok. */
export async function getSiteplanViewerDataAction(projectId: string) {
  await requireSession();
  const supabase = await createClient();
  const [project, units] = await Promise.all([getSiteplanProject(supabase, projectId), listSiteplanUnits(supabase, projectId)]);
  return { project, units };
}

/** Everything the admin row/order editor needs: every unit in the project, ordered by row_label/sort_order/blok. */
export async function getSiteplanEditorDataAction(projectId: string) {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  const units = await listSiteplanUnits(supabase, projectId);
  return { units };
}

export async function listSiteplanUnitsAction(projectId: string) {
  await requireSession();
  const supabase = await createClient();
  return listSiteplanUnits(supabase, projectId);
}

export async function getSiteplanPurchaseForUnitAction(unitId: string) {
  await requireSession();
  const supabase = await createClient();
  return getSiteplanPurchaseForUnit(supabase, unitId);
}

/**
 * Whether a purchase already has a "Kwitansi Tanda Jadi" issued. A receipt, once issued, stays
 * reproducible even if the purchase's transaction_type later moves on (0273's booking -> DP
 * followup) -- so the UI's reprint link should key off this, not off the purchase's *current*
 * transaction_type.
 */
export async function getBookingReceiptForPurchaseAction(purchaseId: string) {
  await requireSession();
  const supabase = await createClient();
  return getBookingReceiptForPurchase(supabase, purchaseId);
}

export async function listPendingSiteplanPurchasesAction() {
  await requireSession();
  const supabase = await createClient();
  return listPendingSiteplanPurchases(supabase);
}

export async function listMySiteplanPurchasesAction() {
  const session = await requireSession();
  const supabase = await createClient();
  return listMySiteplanPurchases(supabase, session.userId);
}

export async function listPendingSiteplanFeeRequestsAction() {
  await requireSession();
  const supabase = await createClient();
  return listPendingSiteplanFeeRequests(supabase);
}

export async function listMySiteplanFeeRequestsAction() {
  const session = await requireSession();
  const supabase = await createClient();
  return listMySiteplanFeeRequests(supabase, session.userId);
}

// ----------------------------------------------------------------------------
// Purchases / verification / fee claims
// ----------------------------------------------------------------------------

/**
 * Declares a buyer for an available unit. The unit locks itself as part of this call: the RPC
 * raises if the unit is no longer `tersedia`, flips it to `verifikasi`, and a partial unique index
 * (loonars_unit_purchases_live_unit_idx) makes a second live purchase on the same unit impossible
 * even if two reps submit at the same instant. Nothing client-side is relied on for that.
 *
 * Returns the new purchase id so the caller can send the rep straight to the kwitansi page for a
 * booking-fee transaction.
 */
export async function submitSiteplanPurchaseAction(input: SiteplanPurchaseInput): Promise<ActionResult<{ purchaseId: string }>> {
  await requireSession();
  const parsed = siteplanPurchaseSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("loonars_unit_purchase_submit", {
    p_unit_id: parsed.data.unitId,
    p_buyer_name: parsed.data.buyerName,
    p_nik: parsed.data.nik || null,
    p_phone: parsed.data.phone || null,
    p_address: parsed.data.address || null,
    p_transaction_type: parsed.data.transactionType,
    p_payment_method: parsed.data.paymentMethod,
    p_price: parsed.data.price ?? null,
    p_booking_fee: parsed.data.bookingFee ?? null,
    p_dp_amount: parsed.data.dpAmount ?? null,
    p_pelunasan_amount: parsed.data.pelunasanAmount ?? null,
    p_handover_date: parsed.data.handoverDate || null,
    p_notes: parsed.data.notes || null,
  });
  if (error) return actionError(error.message);

  revalidatePath(VIEWER_PATH);
  return actionSuccess({ purchaseId: data as string });
}

export async function verifySiteplanPurchaseAction(id: string): Promise<ActionResult> {
  await requirePermission("prospect.finance_verify");
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_unit_purchase_verify", { p_id: id });
  if (error) return actionError(error.message);

  revalidatePath(FINANCE_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

export async function rejectSiteplanPurchaseAction(id: string, reason?: string): Promise<ActionResult> {
  await requirePermission("prospect.finance_verify");
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_unit_purchase_reject", { p_id: id, p_reason: reason ?? null });
  if (error) return actionError(error.message);

  revalidatePath(FINANCE_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

/**
 * feeAmount is omitted for a fee_rate_based project (Loonars 2, 0275) -- the RPC computes and
 * inserts the authoritative amount itself from the rep's own commission rate, ignoring whatever a
 * client might send, so there's nothing here worth trusting from the caller for that path anyway.
 * Every other project still requires it (0204's original manual-amount flow).
 */
export async function requestSiteplanFeeAction(purchaseId: string, feeAmount?: number, phone?: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_unit_fee_request", {
    p_purchase_id: purchaseId,
    p_fee_amount: feeAmount ?? null,
    p_phone: phone ?? null,
  });
  if (error) return actionError(error.message);

  revalidatePath(DASHBOARD_PATH);
  return actionSuccess();
}

/**
 * One-off correction path (0273): moves a verified Booking Fee purchase to DP once the buyer pays
 * more on top of the booking fee -- see loonars_unit_purchase_record_dp_followup's own comment for
 * why this exists and why it's deliberately scoped to just this transition (not a general
 * multi-stage payment ledger).
 */
export async function recordSiteplanDpFollowupAction(input: SiteplanDpFollowupInput): Promise<ActionResult> {
  await requireSession();
  const parsed = siteplanDpFollowupSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_unit_purchase_record_dp_followup", {
    p_purchase_id: parsed.data.purchaseId,
    p_dp_amount: parsed.data.dpAmount,
    p_handover_date: parsed.data.handoverDate,
    p_pelunasan_amount: parsed.data.pelunasanAmount ?? null,
    p_notes: parsed.data.notes || null,
  });
  if (error) return actionError(error.message);

  revalidatePath(VIEWER_PATH);
  revalidatePath(DASHBOARD_PATH);
  revalidatePath(FINANCE_PATH);
  return actionSuccess();
}

// ----------------------------------------------------------------------------
// Sales commission rates (0275) -- admin-managed, siteplan.manage only,
// except getMyCommissionRateAction which a rep uses to preview their own
// fee_rate_based fee amount before submitting.
// ----------------------------------------------------------------------------

export async function listCommissionRatesAction() {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  return listCommissionRates(supabase);
}

export async function getMyCommissionRateAction() {
  const session = await requireSession();
  const supabase = await createClient();
  return getMyCommissionRate(supabase, session.userId);
}

export async function saveCommissionRateAction(input: CommissionRateInput): Promise<ActionResult> {
  const parsed = commissionRateSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  try {
    await saveCommissionRate(supabase, parsed.data.employeeId, parsed.data.commissionRatePercent);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan rate komisi");
  }

  revalidatePath(ADMIN_PATH);
  return actionSuccess();
}

export async function decideSiteplanFeeAction(id: string, approve: boolean, reason?: string): Promise<ActionResult> {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_unit_fee_decide", { p_id: id, p_approve: approve, p_reason: reason ?? null });
  if (error) return actionError(error.message);

  revalidatePath(ADMIN_PATH);
  revalidatePath(DASHBOARD_PATH);
  return actionSuccess();
}

// ----------------------------------------------------------------------------
// Admin: project/unit CRUD, siteplan image, unit hotspot positions
// ----------------------------------------------------------------------------

export async function saveSiteplanProjectAction(input: SiteplanProjectInput): Promise<ActionResult> {
  const parsed = siteplanProjectSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  const payload = {
    kode: parsed.data.kode,
    nama: parsed.data.nama,
    branch_id: parsed.data.branchId,
    lokasi: parsed.data.lokasi || null,
    warna: parsed.data.warna || null,
  };

  try {
    if (parsed.data.id) {
      await updateSiteplanProject(supabase, parsed.data.id, payload);
    } else {
      await createSiteplanProject(supabase, payload);
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan project");
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

export async function saveSiteplanUnitAction(input: SiteplanUnitInput): Promise<ActionResult> {
  const parsed = siteplanUnitSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  const payload = {
    blok: parsed.data.blok,
    tipe: parsed.data.tipe || null,
    harga: parsed.data.harga ?? null,
    luas: parsed.data.luas ?? null,
  };

  try {
    if (parsed.data.id) {
      await updateSiteplanUnit(supabase, parsed.data.id, payload);
    } else {
      await createSiteplanUnit(supabase, { project_id: parsed.data.projectId, ...payload });
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan unit");
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

export async function deleteSiteplanUnitAction(id: string): Promise<ActionResult> {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  try {
    await deleteSiteplanUnit(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus unit");
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

/**
 * Saves one row's full membership + order, given as an ordered array of blok codes (parsed client-side
 * from a comma-separated text field -- same UX as the original loonars-sales admin's row editor). Any
 * code that doesn't match a unit in this project is reported back as an error instead of silently
 * dropped. Units previously in this row but left out of `blokCodes` are moved to "Belum dikelompokkan".
 */
export async function saveSiteplanRowOrderingAction(projectId: string, rowLabel: string, blokCodes: string[]): Promise<ActionResult> {
  await requirePermission("siteplan.manage");
  const trimmedLabel = rowLabel.trim();
  if (!trimmedLabel) return actionError("Nama baris tidak boleh kosong");

  const supabase = await createClient();
  try {
    const units = await listSiteplanUnits(supabase, projectId);
    const unitByBlok = new Map(units.map((u) => [u.blok.trim().toLowerCase(), u.id]));

    const unitIds: string[] = [];
    const unknown: string[] = [];
    for (const raw of blokCodes) {
      const code = raw.trim();
      if (!code) continue;
      const id = unitByBlok.get(code.toLowerCase());
      if (!id) {
        unknown.push(code);
      } else {
        unitIds.push(id);
      }
    }
    if (unknown.length > 0) return actionError(`Unit tidak ditemukan di project ini: ${unknown.join(", ")}`);

    await saveSiteplanRowOrdering(supabase, projectId, trimmedLabel, unitIds);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan urutan baris");
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

/** Deletes a row entirely, moving every unit in it back to "Belum dikelompokkan". */
export async function deleteSiteplanRowAction(projectId: string, rowLabel: string): Promise<ActionResult> {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  try {
    await deleteSiteplanRow(supabase, projectId, rowLabel);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus baris");
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

/** Quick reassignment of one ungrouped (or misplaced) unit into an existing row, appended to its end. */
export async function assignSiteplanUnitToRowAction(unitId: string, rowLabel: string): Promise<ActionResult> {
  await requirePermission("siteplan.manage");
  const trimmedLabel = rowLabel.trim();
  if (!trimmedLabel) return actionError("Nama baris tidak boleh kosong");

  const supabase = await createClient();
  try {
    await assignSiteplanUnitToRow(supabase, unitId, trimmedLabel);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memindahkan unit");
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

// ----------------------------------------------------------------------------
// Booking receipt (Kwitansi Tanda Jadi) -- 0261
// ----------------------------------------------------------------------------

/**
 * Issues the booking receipt for a purchase, or returns the already-issued one on a reprint --
 * loonars_booking_receipt_issue is idempotent per purchase, so pressing "Cetak Kwitansi" twice
 * never burns a second receipt number. The RPC re-checks the caller (owning rep / finance /
 * siteplan admin) itself, since it is security definer and therefore bypasses RLS.
 */
export async function issueBookingReceiptAction(purchaseId: string): Promise<ActionResult<{ receiptNo: string }>> {
  await requirePermission("siteplan.view");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("loonars_booking_receipt_issue", { p_purchase_id: purchaseId });
  if (error) return actionError(error.message);
  if (!data) return actionError("Kwitansi gagal diterbitkan");

  revalidatePath(RECEIPT_PATH(purchaseId));
  return actionSuccess({ receiptNo: data.receipt_no });
}

// ----------------------------------------------------------------------------
// Notary contacts (0266) -- admin-managed, siteplan.manage only
// ----------------------------------------------------------------------------

export async function listNotarisAction() {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  return listNotaris(supabase);
}

export async function saveNotarisAction(input: NotarisContactInput): Promise<ActionResult> {
  const parsed = notarisContactSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  const payload = {
    full_name: parsed.data.fullName,
    phone: normalizeIndonesianPhone(parsed.data.phone),
    notes: parsed.data.notes || null,
  };

  try {
    if (parsed.data.id) {
      await updateNotaris(supabase, parsed.data.id, payload);
    } else {
      await createNotaris(supabase, payload);
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan kontak notaris");
  }

  revalidatePath(ADMIN_PATH);
  return actionSuccess();
}

/** Toggles a notary contact active/inactive -- loonars_akad_schedule_request only ever picks an active one. */
export async function setNotarisActiveAction(id: string, active: boolean): Promise<ActionResult> {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  try {
    await updateNotaris(supabase, id, { active });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah status notaris");
  }
  revalidatePath(ADMIN_PATH);
  return actionSuccess();
}

// ----------------------------------------------------------------------------
// Akad scheduling (0266) -- "Jadwalkan Akad": collects buyer KTP/data and
// sends it straight to the notary via WhatsApp, together with the date
// marketing proposes.
// ----------------------------------------------------------------------------

export async function getAkadScheduleAction(purchaseId: string) {
  await requireSession();
  const supabase = await createClient();
  return getAkadScheduleForPurchase(supabase, purchaseId);
}

/**
 * Records the schedule (loonars_akad_schedule_request, upserts per purchase) then immediately sends
 * the buyer's data as WhatsApp text and the KTP photo as a WhatsApp image to the notary the RPC
 * resolved -- directly from this Server Action, same pattern as
 * features/messaging/actions/messaging.actions.ts, since Postgres itself never makes outbound HTTP
 * calls in this project. The schedule row is saved either way; if the WhatsApp send itself fails
 * (WhatsApp not configured, gateway error), that failure is reported back so the rep knows to follow
 * up manually instead of assuming the notary received it.
 */
export async function requestAkadScheduleAction(input: AkadScheduleRequestInput): Promise<ActionResult<{ notarisName: string }>> {
  await requireSession();
  const parsed = akadScheduleRequestSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data: schedule, error } = await supabase.rpc("loonars_akad_schedule_request", {
    p_purchase_id: parsed.data.purchaseId,
    p_buyer_name: parsed.data.buyerName,
    p_nik: parsed.data.nik,
    p_phone: parsed.data.phone,
    p_address: parsed.data.address,
    p_ktp_photo_path: parsed.data.ktpPhotoPath,
    p_tanggal_akad: parsed.data.tanggalAkad,
    p_notes: parsed.data.notes || null,
  });
  if (error) return actionError(error.message);
  if (!schedule) return actionError("Jadwal akad gagal disimpan");

  const purchase = await getSiteplanPurchaseById(supabase, parsed.data.purchaseId).catch(() => null);
  const unit = purchase?.loonars_units as { blok: string; loonars_projects: { nama: string } | null } | null | undefined;
  const unitLabel = unit?.blok ?? "-";
  const projectName = unit?.loonars_projects?.nama ?? "";
  const tanggalFormatted = new Date(`${schedule.tanggal_akad_diusulkan}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const messageLines = [
    `Halo Ibu ${schedule.notaris_name}, mohon bantuan penjadwalan akad jual beli villa berikut:`,
    "",
    `Nama Pembeli: ${schedule.buyer_name}`,
    `NIK: ${schedule.nik}`,
    `No. HP Pembeli: ${schedule.phone}`,
    `Alamat: ${schedule.address}`,
    `Unit: ${unitLabel}${projectName ? ` — ${projectName}` : ""}`,
    `Tanggal Akad Diusulkan: ${tanggalFormatted}`,
  ];
  if (parsed.data.notes) messageLines.push(`Catatan: ${parsed.data.notes}`);
  messageLines.push("", "Foto KTP menyusul di pesan berikutnya. Mohon konfirmasi kesediaan tanggal tersebut ke marketing kami. Terima kasih.");

  const notarisPhone = normalizeIndonesianPhone(schedule.notaris_phone);
  const textResult = await sendWhatsAppText(notarisPhone, messageLines.join("\n"));
  if (!textResult.success) {
    return actionError(`Jadwal tersimpan, tetapi pesan WhatsApp gagal terkirim ke notaris: ${textResult.error ?? "kesalahan tidak diketahui"}`);
  }

  const ktpUrl = await getSignedUrl("ktp-photos", schedule.ktp_photo_path);
  if (ktpUrl) {
    const imageResult = await sendWhatsAppImage(notarisPhone, ktpUrl, `Foto KTP — ${schedule.buyer_name}`);
    if (!imageResult.success) {
      return actionError(`Data terkirim, tetapi foto KTP gagal terkirim ke notaris: ${imageResult.error ?? "kesalahan tidak diketahui"}. Kirim ulang foto secara manual.`);
    }
  }

  revalidatePath(VIEWER_PATH);
  return actionSuccess({ notarisName: schedule.notaris_name });
}

/** Records the final akad date once the notary has confirmed by phone/WhatsApp directly to the requesting rep -- no automated reply parsing in this first version. */
export async function confirmAkadScheduleAction(input: AkadScheduleConfirmInput): Promise<ActionResult> {
  const parsed = akadScheduleConfirmSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_akad_schedule_confirm", { p_id: parsed.data.id, p_tanggal_akad_final: parsed.data.tanggalAkadFinal });
  if (error) return actionError(error.message);

  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}
