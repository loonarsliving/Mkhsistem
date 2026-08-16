"use server";

import { revalidatePath } from "next/cache";

import { reviewLaborPayment, type PaymentAiReview, type PaymentReviewPhoto, type PaymentReviewWbsLine } from "@/lib/ai/domains/construction-payment-review";
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
  kepalaCabangDecideLaborPaymentSchema,
  reviewLaborPaymentSchema,
  setLaborContractWeightsSchema,
  type AddLaborDeductionInput,
  type ApplyLaborAdvanceInput,
  type CreateContractorInput,
  type CreateLaborContractInput,
  type DecideLaborPaymentInput,
  type GenerateLaborPaymentInput,
  type KepalaCabangDecideLaborPaymentInput,
  type ReviewLaborPaymentInput,
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
    p_unit_id: parsed.data.unitId || null,
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

/**
 * Kepala Cabang's own-branch decision (0220) -- approves a 'draft' payment
 * forward to 'kc_approved' for final Super Admin/Finance approval, or
 * rejects it outright. cm_kepala_cabang_decide_labor_payment enforces the
 * branch match server-side, so this is safe to expose to anyone holding
 * construction_finance.approve_branch, not just .manage.
 */
export async function kepalaCabangDecideLaborPaymentAction(input: KepalaCabangDecideLaborPaymentInput): Promise<ActionResult> {
  await requireSession();
  const parsed = kepalaCabangDecideLaborPaymentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cm_kepala_cabang_decide_labor_payment", {
    p_payment_id: parsed.data.paymentId,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess();
}

/**
 * Gathers WBS-claim + already-assessed daily-photo evidence for this
 * payment (cm_labor_payment_ai_context, 0219), asks the AI domain to
 * synthesize a verdict, then persists it (cm_save_labor_payment_ai_review)
 * so it survives a page refresh and shows up next to the payment for
 * whoever approves it.
 */
export async function reviewLaborPaymentAction(input: ReviewLaborPaymentInput): Promise<ActionResult<PaymentAiReview & { photoCount: number }>> {
  await requireSession();
  const parsed = reviewLaborPaymentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data: context, error: contextError } = await supabase.rpc("cm_labor_payment_ai_context", { p_payment_id: parsed.data.paymentId });
  if (contextError) return actionError(contextError.message);

  const ctx = context as {
    contractor_name: string;
    project_name: string;
    period_start: string;
    period_end: string;
    gross_earned: number;
    wbs_breakdown: { name: string; weight_pct: number; progress_pct: number; last_paid_progress_pct: number }[];
    photos: { report_date: string; employee_name: string; caption: string | null; ai_stage: string | null; ai_progress_pct: number | null; ai_notes: string | null; ai_concerns: string | null }[];
  };

  const wbsBreakdown: PaymentReviewWbsLine[] = ctx.wbs_breakdown.map((w) => ({
    name: w.name,
    weightPct: Number(w.weight_pct),
    progressPct: Number(w.progress_pct),
    lastPaidProgressPct: Number(w.last_paid_progress_pct),
  }));
  const photos: PaymentReviewPhoto[] = ctx.photos.map((p) => ({
    reportDate: p.report_date,
    employeeName: p.employee_name,
    caption: p.caption,
    aiStage: p.ai_stage,
    aiProgressPct: p.ai_progress_pct,
    aiNotes: p.ai_notes,
    aiConcerns: p.ai_concerns,
  }));

  let review: PaymentAiReview;
  try {
    review = await reviewLaborPayment({
      contractorName: ctx.contractor_name,
      projectName: ctx.project_name,
      periodStart: ctx.period_start,
      periodEnd: ctx.period_end,
      grossEarned: Number(ctx.gross_earned),
      wbsBreakdown,
      photos,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Analisa AI gagal");
  }

  const { error: saveError } = await supabase.rpc("cm_save_labor_payment_ai_review", {
    p_payment_id: parsed.data.paymentId,
    p_verdict: review.verdict,
    p_summary: review.summary,
    p_concerns: review.concerns,
    p_photo_count: photos.length,
  });
  if (saveError) return actionError(saveError.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ ...review, photoCount: photos.length });
}
