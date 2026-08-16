"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/constants/rbac";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  addBoqLineSchema,
  createConstructionProjectSchema,
  deleteBoqLineSchema,
  recordConstructionFundTransferSchema,
  settleConstructionExpenseSchema,
  submitConstructionExpenseSchema,
  syncTukangBorongonSchema,
  type AddBoqLineInput,
  type CreateConstructionProjectInput,
  type DeleteBoqLineInput,
  type RecordConstructionFundTransferInput,
  type SettleConstructionExpenseInput,
  type SubmitConstructionExpenseInput,
  type SyncTukangBorongonInput,
} from "../schemas/construction-finance.schema";

/**
 * Every write here is an RPC call, never a table write -- construction_submit_expense,
 * construction_settle_expense, construction_record_fund_transfer (migration
 * 0193) are security definer and re-check the permission + branch scope themselves.
 */

export async function submitConstructionExpenseAction(input: SubmitConstructionExpenseInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = submitConstructionExpenseSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("construction_submit_expense", {
    p_project_id: parsed.data.projectId,
    p_expense_type: parsed.data.expenseType,
    p_party_name: parsed.data.partyName,
    p_amount: parsed.data.amount,
    p_description: parsed.data.description || null,
    p_expense_date: parsed.data.expenseDate,
    p_material_id: parsed.data.materialId || null,
    p_quantity: parsed.data.quantity ?? null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function createConstructionProjectAction(input: CreateConstructionProjectInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createConstructionProjectSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("construction_create_project", {
    p_branch_id: parsed.data.branchId,
    p_name: parsed.data.name,
    p_budget_per_unit: parsed.data.budgetPerUnit,
    p_total_units: parsed.data.totalUnits,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function addBoqLineAction(input: AddBoqLineInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = addBoqLineSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_add_project_boq_line", {
    p_project_id: parsed.data.projectId,
    p_category: parsed.data.category,
    p_description: parsed.data.description,
    p_quantity: parsed.data.quantity,
    p_unit: parsed.data.unit,
    p_unit_price: parsed.data.unitPrice,
    p_material_id: parsed.data.materialId || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

/**
 * Jogja's running Loonars project (and any other branch's currently-running
 * project) is still tracked in mkh-properti's own tukang_borongan table --
 * not a construction_projects row here. The owner types in each blok's
 * current sisa kontrak by hand and this pushes it one-way to mkh-properti
 * via sync_log (dispatched by sync_dispatch_pending, applied there by
 * sync_inbound's tukang_borongan_sisa_upsert branch, migration 0019).
 * sync_log has no RLS policies (deny-all for regular clients), so this
 * checks the permission explicitly and writes with the service role.
 */
export async function syncTukangBorongonAction(input: SyncTukangBorongonInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!hasPermission(session, PERMISSIONS.CONSTRUCTION_FINANCE_MANAGE)) {
    return actionError("Anda tidak punya izin untuk ini");
  }
  const parsed = syncTukangBorongonSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from("sync_log").insert({
    direction: "outbound",
    event_type: "tukang_borongan_sisa_upsert",
    source_table: "manual_input",
    source_id: `${d.proyek}-${d.blok || "-"}-${d.nama}`,
    idempotency_key: `tukang-sisa-${crypto.randomUUID()}`,
    payload: {
      proyek: d.proyek,
      blok: d.blok || null,
      nama: d.nama,
      item: d.item || null,
      nilai_kontrak: d.nilaiKontrak,
      terbayar: d.terbayar,
      total_unit: d.totalUnit ?? null,
      harga_per_unit: d.hargaPerUnit ?? null,
      unit_selesai: d.unitSelesai ?? null,
      ket: d.ket || null,
    },
  });
  if (error) return actionError(error.message);

  return actionSuccess();
}

export async function deleteBoqLineAction(input: DeleteBoqLineInput): Promise<ActionResult> {
  await requireSession();
  const parsed = deleteBoqLineSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cm_delete_project_boq_line", { p_line_id: parsed.data.id });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess();
}

export async function settleConstructionExpenseAction(input: SettleConstructionExpenseInput): Promise<ActionResult> {
  await requireSession();
  const parsed = settleConstructionExpenseSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("construction_settle_expense", { p_id: parsed.data.id });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess();
}

export async function recordConstructionFundTransferAction(input: RecordConstructionFundTransferInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = recordConstructionFundTransferSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("construction_record_fund_transfer", {
    p_project_id: parsed.data.projectId,
    p_amount: parsed.data.amount,
    p_transfer_date: parsed.data.transferDate,
    p_note: parsed.data.note || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}
