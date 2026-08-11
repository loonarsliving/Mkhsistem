"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  assignSiteplanUnitToRow,
  createSiteplanProject,
  createSiteplanUnit,
  deleteSiteplanRow,
  deleteSiteplanUnit,
  getSiteplanProject,
  getSiteplanPurchaseForUnit,
  listMySiteplanFeeRequests,
  listMySiteplanPurchases,
  listPendingSiteplanFeeRequests,
  listPendingSiteplanPurchases,
  listSiteplanProjects,
  listSiteplanUnits,
  saveSiteplanRowOrdering,
  updateSiteplanProject,
  updateSiteplanUnit,
} from "@/repositories/loonars-siteplan.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { siteplanProjectSchema, siteplanPurchaseSchema, siteplanUnitSchema, type SiteplanProjectInput, type SiteplanPurchaseInput, type SiteplanUnitInput } from "../schemas/siteplan.schema";

const VIEWER_PATH = "/siteplan";
const FINANCE_PATH = "/crm/finance";
const DASHBOARD_PATH = "/dashboard";
const ADMIN_PATH = "/siteplan/admin";

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

export async function submitSiteplanPurchaseAction(input: SiteplanPurchaseInput): Promise<ActionResult> {
  await requireSession();
  const parsed = siteplanPurchaseSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_unit_purchase_submit", {
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
  return actionSuccess();
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

export async function requestSiteplanFeeAction(purchaseId: string, feeAmount: number, phone?: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_unit_fee_request", {
    p_purchase_id: purchaseId,
    p_fee_amount: feeAmount,
    p_phone: phone ?? null,
  });
  if (error) return actionError(error.message);

  revalidatePath(DASHBOARD_PATH);
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
