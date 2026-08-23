import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Reads for Construction Management's Petugas Gudang + stock consumption/opname (0249-0251). Writes go through cm_assign_warehouse_keeper/cm_consume_material/cm_record_stock_opname. */

export interface WarehouseKeeper {
  id: string;
  employeeId: string;
  employeeName: string;
  assignedAt: string;
}

/** The current active Petugas Gudang for a project, or null if none assigned yet. */
export async function getActiveWarehouseKeeper(supabase: TypedSupabaseClient, projectId: string): Promise<WarehouseKeeper | null> {
  const { data, error } = await supabase
    .from("cm_warehouse_keepers")
    .select("id, employee_id, assigned_at, employee:employee_id(full_name)")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    employeeId: data.employee_id,
    employeeName: (data.employee as unknown as { full_name: string } | null)?.full_name ?? "-",
    assignedAt: data.assigned_at,
  };
}

export interface BranchEmployeeOption {
  id: string;
  fullName: string;
}

/** Active employees in a branch, for the "tunjuk Petugas Gudang" picker. */
export async function listBranchEmployeeOptions(supabase: TypedSupabaseClient, branchId: string): Promise<BranchEmployeeOption[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("branch_id", branchId)
    .eq("employment_status", "active")
    .is("deleted_at", null)
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name }));
}

export interface MaterialConsumptionRow {
  id: string;
  materialName: string;
  unitSatuan: string;
  quantity: number;
  wbsName: string | null;
  photoUrl: string;
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
}

/** History of stock-out (serah terima ke pekerjaan) for a project -- newest first. */
export async function listMaterialConsumption(supabase: TypedSupabaseClient, projectId: string): Promise<MaterialConsumptionRow[]> {
  const { data, error } = await supabase
    .from("cm_material_consumption")
    .select(
      "id, quantity, photo_url, note, created_at, material:material_id(name, unit_satuan), wbs:project_wbs_id(name), recorder:recorded_by(full_name)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const material = row.material as unknown as { name: string; unit_satuan: string } | null;
    return {
      id: row.id,
      materialName: material?.name ?? "-",
      unitSatuan: material?.unit_satuan ?? "",
      quantity: Number(row.quantity),
      wbsName: (row.wbs as unknown as { name: string } | null)?.name ?? null,
      photoUrl: row.photo_url,
      note: row.note,
      recordedByName: (row.recorder as unknown as { full_name: string } | null)?.full_name ?? null,
      createdAt: row.created_at,
    };
  });
}

export interface StockOpnameRow {
  id: string;
  materialName: string;
  unitSatuan: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  note: string | null;
  countedByName: string | null;
  createdAt: string;
}

/** History of physical stock counts for a project -- newest first. */
export async function listStockOpnames(supabase: TypedSupabaseClient, projectId: string): Promise<StockOpnameRow[]> {
  const { data, error } = await supabase
    .from("cm_stock_opnames")
    .select("id, system_quantity, counted_quantity, variance, note, created_at, material:material_id(name, unit_satuan), counter:counted_by(full_name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const material = row.material as unknown as { name: string; unit_satuan: string } | null;
    return {
      id: row.id,
      materialName: material?.name ?? "-",
      unitSatuan: material?.unit_satuan ?? "",
      systemQuantity: Number(row.system_quantity),
      countedQuantity: Number(row.counted_quantity),
      variance: Number(row.variance),
      note: row.note,
      countedByName: (row.counter as unknown as { full_name: string } | null)?.full_name ?? null,
      createdAt: row.created_at,
    };
  });
}
