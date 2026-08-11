"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/services/storage.service";
import {
  createSiteplanProject,
  createSiteplanUnit,
  deleteSiteplanUnit,
  getSiteplanImage,
  getSiteplanProject,
  getSiteplanPurchaseForUnit,
  listMySiteplanFeeRequests,
  listMySiteplanPurchases,
  listPendingSiteplanFeeRequests,
  listPendingSiteplanPurchases,
  listSiteplanProjects,
  listSiteplanUnits,
  listUnitPositions,
  listUnpositionedUnits,
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

/** Everything the viewer needs for one project: the project itself, its units, the background image (if any), and every placed hotspot. */
export async function getSiteplanViewerDataAction(projectId: string) {
  await requireSession();
  const supabase = await createClient();
  const [project, units, image, positions] = await Promise.all([
    getSiteplanProject(supabase, projectId),
    listSiteplanUnits(supabase, projectId),
    getSiteplanImage(supabase, projectId),
    listUnitPositions(supabase, projectId),
  ]);
  const imageUrl = image ? await getPublicUrl("siteplan-images", image.image_path) : null;
  return { project, units, image: image ? { ...image, imageUrl } : null, positions };
}

/** Everything the admin position editor needs: units, image, placed positions, and the unplaced-units sidebar list. */
export async function getSiteplanEditorDataAction(projectId: string) {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  const [units, image, positions, unpositioned] = await Promise.all([
    listSiteplanUnits(supabase, projectId),
    getSiteplanImage(supabase, projectId),
    listUnitPositions(supabase, projectId),
    listUnpositionedUnits(supabase, projectId),
  ]);
  const imageUrl = image ? await getPublicUrl("siteplan-images", image.image_path) : null;
  return { units, image: image ? { ...image, imageUrl } : null, positions, unpositioned };
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

/** Called after the client has already uploaded the file to the siteplan-images bucket via uploadEntityFile -- this just persists the resulting path + natural dimensions. */
export async function saveSiteplanImageAction(
  projectId: string,
  imagePath: string,
  imageWidth?: number,
  imageHeight?: number,
): Promise<ActionResult> {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_siteplan_image_save", {
    p_project_id: projectId,
    p_image_path: imagePath,
    p_image_width: imageWidth ?? null,
    p_image_height: imageHeight ?? null,
  });
  if (error) return actionError(error.message);

  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}

export async function upsertUnitPositionAction(unitId: string, xPct: number, yPct: number): Promise<ActionResult> {
  await requirePermission("siteplan.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_unit_position_upsert", { p_unit_id: unitId, p_x_pct: xPct, p_y_pct: yPct });
  if (error) return actionError(error.message);

  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEWER_PATH);
  return actionSuccess();
}
