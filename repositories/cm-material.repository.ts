import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Reads for the Construction Management module's material stock (0207) --
 * first slice of the approved architecture, connecting the existing Kendari
 * material-purchase input (construction_expenses) to a real stock ledger.
 * Writes happen inside construction_submit_expense (security definer), never
 * a direct table write here.
 */

export interface MaterialCatalogItem {
  id: string;
  code: string;
  name: string;
  category: string;
  unitSatuan: string;
  standardPrice: number | null;
}

/** Active material catalog, for the "pilih material" dropdown on the expense form. */
export async function listActiveMaterials(supabase: TypedSupabaseClient): Promise<MaterialCatalogItem[]> {
  const { data, error } = await supabase
    .from("cm_materials")
    .select("id, code, name, category, unit_satuan, standard_price")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    unitSatuan: row.unit_satuan,
    standardPrice: row.standard_price === null ? null : Number(row.standard_price),
  }));
}

export interface MaterialStockRow {
  materialId: string;
  materialCode: string;
  materialName: string;
  unitSatuan: string;
  minStock: number;
  quantity: number;
}

/** Current stock per material for a project -- what the "beli semen -> stok bertambah" connection actually credits. */
export async function listMaterialStock(supabase: TypedSupabaseClient, projectId: string): Promise<MaterialStockRow[]> {
  const { data, error } = await supabase
    .from("cm_material_stock")
    .select("material_id, quantity, material:material_id(code, name, unit_satuan, min_stock)")
    .eq("project_id", projectId)
    .order("material(name)", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const material = row.material as unknown as { code: string; name: string; unit_satuan: string; min_stock: number } | null;
    return {
      materialId: row.material_id,
      materialCode: material?.code ?? "-",
      materialName: material?.name ?? "-",
      unitSatuan: material?.unit_satuan ?? "",
      minStock: Number(material?.min_stock ?? 0),
      quantity: Number(row.quantity),
    };
  });
}
