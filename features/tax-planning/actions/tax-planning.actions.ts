"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/constants/rbac";
import { generateTaxPlanningNarrative } from "@/lib/ai/domains/tax-planning";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeTaxPlanning } from "@/lib/tax-planning/calculator";
import { fetchMkhPropertiJurnal, isMkhPropertiConfigured } from "@/lib/tax-planning/mkh-properti-client";
import { getFiscalConfig } from "@/repositories/tax-planning.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  decideTaxProposalSchema,
  runTaxPlanningAnalysisSchema,
  updateFiscalConfigSchema,
  type DecideTaxProposalInput,
  type RunTaxPlanningAnalysisInput,
  type UpdateFiscalConfigInput,
} from "../schemas/tax-planning.schema";

/**
 * Every number in a Tax Planning analysis is computed synchronously by
 * lib/tax-planning/calculator.ts from mkh-properti's real jurnal -- this
 * doesn't need FRIDAY's async ai_job_queue pipeline (one Gemini call for a
 * narrative, not a multi-domain cross-company analysis), so the whole run
 * happens in one Server Action call, same pattern as
 * lib/ai/domains/finance.ts's generateBranchAdvisory. The AI narrative is
 * best-effort: if Gemini fails, the analysis still saves with its computed
 * numbers and proposals intact (those never depended on the model), just
 * without a narrative paragraph -- the numbers are the module's actual
 * value, the narrative is a convenience on top.
 */
export async function runTaxPlanningAnalysisAction(input: RunTaxPlanningAnalysisInput): Promise<ActionResult<{ analysisId: string }>> {
  const session = await requirePermission(PERMISSIONS.TAX_PLANNING_RUN);
  const parsed = runTaxPlanningAnalysisSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  if (!isMkhPropertiConfigured()) {
    return actionError("Tax Planning belum dikonfigurasi -- MKH_PROPERTI_SUPABASE_URL/MKH_PROPERTI_SUPABASE_ANON_KEY belum diisi.");
  }

  const { periodStart, periodEnd } = parsed.data;
  const supabase = createAdminClient();

  let jurnal;
  try {
    jurnal = await fetchMkhPropertiJurnal(periodStart, periodEnd);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("tax_planning_analyses").insert({
      period_start: periodStart,
      period_end: periodEnd,
      status: "failed",
      error_detail: message,
      requested_by: session.userId,
    });
    revalidatePath("/tax-planning");
    logger.error("Tax Planning analysis failed to read mkh-properti jurnal", { periodStart, periodEnd, error: message });
    return actionError(`Gagal membaca data mkh-properti: ${message}`);
  }

  if (jurnal.length === 0) {
    return actionError("Tidak ada transaksi jurnal mkh-properti pada periode ini.");
  }

  const fiscalConfig = await getFiscalConfig(supabase);
  const result = computeTaxPlanning(periodStart, periodEnd, jurnal, fiscalConfig);

  let narrative: string | null = null;
  try {
    narrative = await generateTaxPlanningNarrative(result);
  } catch (err) {
    logger.error("Tax Planning narrative generation failed (analysis still saved)", { periodStart, periodEnd, error: err instanceof Error ? err.message : String(err) });
  }

  const { data: analysis, error: insertError } = await supabase
    .from("tax_planning_analyses")
    .insert({
      period_start: periodStart,
      period_end: periodEnd,
      status: "ready",
      computed_result: result as never,
      narrative,
      requested_by: session.userId,
    })
    .select("id")
    .single();
  if (insertError || !analysis) {
    return actionError(`Gagal menyimpan hasil analisa: ${insertError?.message ?? "tidak diketahui"}`);
  }

  if (result.proposals.length > 0) {
    const { error: proposalsError } = await supabase.from("tax_planning_proposals").insert(
      result.proposals.map((p) => ({
        analysis_id: analysis.id,
        strategy_key: p.key,
        title: p.title,
        description: p.description,
        estimated_impact_idr: p.estimatedImpactIdr,
        confidence: p.confidence,
        requires_professional_review: p.requiresProfessionalReview,
      })),
    );
    if (proposalsError) {
      logger.error("Tax Planning proposals insert failed (analysis row saved)", { analysisId: analysis.id, error: proposalsError.message });
    }
  }

  revalidatePath("/tax-planning");
  return actionSuccess({ analysisId: analysis.id });
}

const DECISION_TO_STATUS = {
  accept: "accepted",
  reject: "rejected",
  needs_review: "needs_review",
} as const;

export async function decideTaxProposalAction(input: DecideTaxProposalInput): Promise<ActionResult<{ note: string }>> {
  const session = await requirePermission(PERMISSIONS.TAX_PLANNING_DECIDE);
  const parsed = decideTaxProposalSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const { proposalId, decision, note } = parsed.data;
  const supabase = createAdminClient();

  // Atomic claim, same pattern as decideFridayActionAction -- two approvers
  // clicking at once produce one decision and one "already decided" message.
  const { data: claimed, error } = await supabase
    .from("tax_planning_proposals")
    .update({
      status: DECISION_TO_STATUS[decision],
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
      decision_note: note && note.length > 0 ? note : null,
    })
    .eq("id", proposalId)
    .eq("status", "proposed")
    .select("id")
    .maybeSingle();
  if (error) return actionError(`Gagal menyimpan keputusan: ${error.message}`);
  if (!claimed) return actionError("Usulan ini sudah diputuskan sebelumnya.");

  revalidatePath("/tax-planning");
  const noteText =
    decision === "accept"
      ? "Usulan diterima sebagai bahan diskusi dengan konsultan pajak -- belum berarti sudah dilaporkan ke SPT."
      : decision === "reject"
        ? "Usulan ditolak."
        : "Usulan ditandai perlu ditinjau lebih lanjut.";
  return actionSuccess({ note: noteText });
}

export async function updateFiscalConfigAction(input: UpdateFiscalConfigInput): Promise<ActionResult<{ note: string }>> {
  const session = await requirePermission(PERMISSIONS.TAX_PLANNING_CONFIGURE);
  const parsed = updateFiscalConfigSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const data = parsed.data;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("tax_planning_fiscal_config")
    .update({
      fiscal_loss_carryforward_idr: data.fiscalLossCarryforwardIdr,
      fiscal_loss_expiry_note: data.fiscalLossExpiryNote && data.fiscalLossExpiryNote.length > 0 ? data.fiscalLossExpiryNote : null,
      umkm_final_tax_first_eligible_year: data.umkmFinalTaxFirstEligibleYear ?? null,
      umkm_final_tax_years_used: data.umkmFinalTaxYearsUsed,
      annual_turnover_threshold_idr: data.annualTurnoverThresholdIdr,
      notes: data.notes && data.notes.length > 0 ? data.notes : null,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) return actionError(`Gagal menyimpan konfigurasi fiskal: ${error.message}`);

  revalidatePath("/tax-planning");
  return actionSuccess({ note: "Konfigurasi fiskal tersimpan." });
}
