"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  recordConstructionFundTransferSchema,
  settleConstructionExpenseSchema,
  submitConstructionExpenseSchema,
  type RecordConstructionFundTransferInput,
  type SettleConstructionExpenseInput,
  type SubmitConstructionExpenseInput,
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
