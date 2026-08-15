import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Reads for Construction Management's BOQ (0210/0217). Writes are all security-definer RPCs. */

export interface ProjectBoqLine {
  id: string;
  category: "material" | "labor" | "equipment" | "other";
  materialName: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  budget: number;
  wbsName: string | null;
}

export async function listProjectBoqLines(supabase: TypedSupabaseClient, projectId: string): Promise<ProjectBoqLine[]> {
  const { data, error } = await supabase
    .from("cm_project_boq")
    .select("id, category, description, quantity, unit, unit_price, budget, material:material_id(name), wbs:project_wbs_id(name)")
    .eq("project_id", projectId)
    .is("unit_id", null)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    materialName: (row.material as unknown as { name: string } | null)?.name ?? null,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    budget: Number(row.budget),
    wbsName: (row.wbs as unknown as { name: string } | null)?.name ?? null,
  }));
}
