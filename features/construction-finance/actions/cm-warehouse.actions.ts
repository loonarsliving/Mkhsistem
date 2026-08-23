"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  assignWarehouseKeeperSchema,
  consumeMaterialSchema,
  recordStockOpnameSchema,
  type AssignWarehouseKeeperInput,
  type ConsumeMaterialInput,
  type RecordStockOpnameInput,
} from "../schemas/construction-finance.schema";

/**
 * Every write here is an RPC call -- cm_assign_warehouse_keeper,
 * cm_consume_material, cm_record_stock_opname (migrations 0249-0251) are
 * security definer and re-check permission + Petugas Gudang assignment
 * themselves; nothing here is a trusted client-side check.
 */

export async function assignWarehouseKeeperAction(input: AssignWarehouseKeeperInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = assignWarehouseKeeperSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_assign_warehouse_keeper", {
    p_project_id: parsed.data.projectId,
    p_employee_id: parsed.data.employeeId,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function consumeMaterialAction(input: ConsumeMaterialInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = consumeMaterialSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_consume_material", {
    p_project_id: parsed.data.projectId,
    p_material_id: parsed.data.materialId,
    p_quantity: parsed.data.quantity,
    p_photo_url: parsed.data.photoUrl,
    p_project_wbs_id: parsed.data.projectWbsId || null,
    p_note: parsed.data.note || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function recordStockOpnameAction(input: RecordStockOpnameInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = recordStockOpnameSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_record_stock_opname", {
    p_project_id: parsed.data.projectId,
    p_material_id: parsed.data.materialId,
    p_counted_quantity: parsed.data.countedQuantity,
    p_note: parsed.data.note || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}
