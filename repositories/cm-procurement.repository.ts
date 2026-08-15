import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Reads for Construction Management's material requirement engine + purchase requests (0211/0212). */

export interface MaterialRequirementRow {
  materialId: string;
  materialName: string;
  unitSatuan: string;
  boqQuantity: number;
  wbsName: string | null;
  wbsProgressPct: number;
  requiredQuantity: number;
  stockQuantity: number;
  coveragePct: number | null;
  status: "belum_perlu" | "shortage" | "normal" | "overstock_risk" | "excessive";
}

/** WBS x BOQ x progress x stock -- the core connection: what material is actually needed right now, given approved progress. */
export async function listMaterialRequirement(supabase: TypedSupabaseClient, projectId: string): Promise<MaterialRequirementRow[]> {
  const { data, error } = await supabase.rpc("cm_material_requirement", { p_project_id: projectId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    materialId: row.material_id,
    materialName: row.material_name,
    unitSatuan: row.unit_satuan,
    boqQuantity: Number(row.boq_quantity),
    wbsName: row.wbs_name,
    wbsProgressPct: Number(row.wbs_progress_pct),
    requiredQuantity: Number(row.required_quantity),
    stockQuantity: Number(row.stock_quantity),
    coveragePct: row.coverage_pct === null ? null : Number(row.coverage_pct),
    status: row.status,
  }));
}

export interface PurchaseRequestItem {
  id: string;
  materialId: string;
  materialName: string;
  unitSatuan: string;
  requestedQuantity: number;
  suggestedQuantity: number | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "fulfilled";
  requestedByName: string | null;
  requestedAt: string;
}

export async function listPendingPurchaseRequests(supabase: TypedSupabaseClient): Promise<PurchaseRequestItem[]> {
  const { data, error } = await supabase
    .from("cm_purchase_requests")
    .select("id, material_id, requested_quantity, suggested_quantity, reason, status, requested_at, material:material_id(name, unit_satuan), requester:requested_by(full_name)")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const material = row.material as unknown as { name: string; unit_satuan: string } | null;
    return {
      id: row.id,
      materialId: row.material_id,
      materialName: material?.name ?? "-",
      unitSatuan: material?.unit_satuan ?? "",
      requestedQuantity: Number(row.requested_quantity),
      suggestedQuantity: row.suggested_quantity === null ? null : Number(row.suggested_quantity),
      reason: row.reason,
      status: row.status,
      requestedByName: (row.requester as unknown as { full_name: string } | null)?.full_name ?? null,
      requestedAt: row.requested_at,
    };
  });
}

/** Every PR for a project (any status) -- history view. */
export async function listProjectPurchaseRequests(supabase: TypedSupabaseClient, projectId: string): Promise<PurchaseRequestItem[]> {
  const { data, error } = await supabase
    .from("cm_purchase_requests")
    .select("id, material_id, requested_quantity, suggested_quantity, reason, status, requested_at, material:material_id(name, unit_satuan), requester:requested_by(full_name)")
    .eq("project_id", projectId)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const material = row.material as unknown as { name: string; unit_satuan: string } | null;
    return {
      id: row.id,
      materialId: row.material_id,
      materialName: material?.name ?? "-",
      unitSatuan: material?.unit_satuan ?? "",
      requestedQuantity: Number(row.requested_quantity),
      suggestedQuantity: row.suggested_quantity === null ? null : Number(row.suggested_quantity),
      reason: row.reason,
      status: row.status,
      requestedByName: (row.requester as unknown as { full_name: string } | null)?.full_name ?? null,
      requestedAt: row.requested_at,
    };
  });
}
