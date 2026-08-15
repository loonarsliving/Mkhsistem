"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  addLaborDeductionSchema,
  applyLaborAdvanceSchema,
  createContractorSchema,
  createLaborContractSchema,
  decideLaborPaymentSchema,
  generateLaborPaymentSchema,
  setLaborContractWeightsSchema,
  type AddLaborDeductionInput,
  type ApplyLaborAdvanceInput,
  type CreateContractorInput,
  type CreateLaborContractInput,
  type DecideLaborPaymentInput,
  type GenerateLaborPaymentInput,
  type SetLaborContractWeightsInput,
} from "../schemas/cm-labor.schema";

/** Every write here is an RPC call -- all security definer (migration 0213/0214). */

export async function createContractorAction(input: CreateContractorInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createContractorSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_create_contractor", {
    p_full_name: parsed.data.fullName,
    p_contractor_type: parsed.data.contractorType,
    p_phone: parsed.data.phone || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function createLaborContractAction(input: CreateLaborContractInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createLaborContractSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_create_labor_contract", {
    p_project_id: parsed.data.projectId,
    p_contractor_id: parsed.data.contractorId,
    p_contract_value: parsed.data.contractValue,
    p_retention_pct: parsed.data.retentionPct ?? 0,
    p_start_date: parsed.data.startDate,
    p_target_completion: parsed.data.targetCompletion || null,
    p_notes: parsed.data.notes || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function setLaborContractWeightsAction(input: SetLaborContractWeightsInput): Promise<ActionResult> {
  await requireSession();
  const parsed = setLaborContractWeightsSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const total = parsed.data.weights.reduce((sum, w) => sum + w.weightPct, 0);
  if (Math.abs(total - 100) > 0.5) return actionError(`Total bobot harus 100% (saat ini ${total}%)`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cm_set_labor_contract_weights", {
    p_contract_id: parsed.data.contractId,
    p_weights: parsed.data.weights.map((w) => ({ project_wbs_id: w.projectWbsId, weight_pct: w.weightPct })),
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess();
}

export async function generateLaborPaymentAction(input: GenerateLaborPaymentInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = generateLaborPaymentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_generate_labor_payment", {
    p_contract_id: parsed.data.contractId,
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function addLaborDeductionAction(input: AddLaborDeductionInput): Promise<ActionResult> {
  await requireSession();
  const parsed = addLaborDeductionSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cm_add_labor_deduction", {
    p_payment_id: parsed.data.paymentId,
    p_amount: parsed.data.amount,
    p_category: parsed.data.category,
    p_reason: parsed.data.reason,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess();
}

export async function applyLaborAdvanceAction(input: ApplyLaborAdvanceInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = applyLaborAdvanceSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_apply_labor_advance", {
    p_contract_id: parsed.data.contractId,
    p_amount: parsed.data.amount,
    p_note: parsed.data.note || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function decideLaborPaymentAction(input: DecideLaborPaymentInput): Promise<ActionResult> {
  await requireSession();
  const parsed = decideLaborPaymentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = parsed.data.approve
    ? await supabase.rpc("cm_approve_labor_payment", { p_payment_id: parsed.data.paymentId })
    : await supabase.rpc("cm_reject_labor_payment", { p_payment_id: parsed.data.paymentId, p_reason: parsed.data.reason || null });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess();
}
