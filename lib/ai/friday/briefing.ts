import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { FRIDAY_ACTIONS } from "./action-catalog";
import { runFridayAnalysis } from "./analyst";
import { captureSignalSnapshot } from "./signals";

const RISK_BY_KEY = new Map(FRIDAY_ACTIONS.map((a) => [a.key, a.riskTier]));

export interface FridayBriefingJobPayload {
  briefing_id: string;
  /** Only set for on-demand runs from the console; the daily briefing has no question. */
  question?: string | null;
}

/**
 * Fills one pending friday_briefings row.
 *
 * The row already exists before this runs (created by
 * friday_enqueue_daily_briefing() or by the on-demand server action) — see the
 * migration's note on why. That ordering is what lets this function treat a
 * failure as something to *record* rather than something to swallow: on any
 * error the row is moved to 'failed' with the reason attached, and the error is
 * then rethrown so the AI job queue still applies its normal retry/backoff.
 * Leadership sees "today's briefing failed: <reason>" instead of an empty page,
 * and the queue still gets its four attempts.
 */
export async function processFridayExecutiveBriefing(payload: FridayBriefingJobPayload, jobId?: string) {
  const supabase = createAdminClient();
  const briefingId = payload.briefing_id;
  if (!briefingId) throw new Error("friday_executive_briefing job tanpa briefing_id");

  const { data: briefing, error: loadError } = await supabase
    .from("friday_briefings")
    .select("id, scope, branch_id, status")
    .eq("id", briefingId)
    .maybeSingle();
  if (loadError) throw new Error(`Gagal memuat briefing ${briefingId}: ${loadError.message}`);
  if (!briefing) throw new Error(`Briefing ${briefingId} tidak ditemukan`);

  // A retry landing on an already-completed briefing must not overwrite it with
  // a second, differently-worded analysis -- the row may already have approved
  // actions hanging off it.
  if (briefing.status === "ready") {
    return { briefingId, skipped: "already_ready" as const };
  }

  let branchName: string | null = null;
  if (briefing.branch_id) {
    const { data: branch } = await supabase.from("branches").select("name").eq("id", briefing.branch_id).maybeSingle();
    branchName = branch?.name ?? null;
  }

  try {
    const snapshot = await captureSignalSnapshot({ branchId: briefing.branch_id, branchName });
    const analysis = await runFridayAnalysis(snapshot, { question: payload.question ?? null, jobId });

    const { error: updateError } = await supabase
      .from("friday_briefings")
      .update({
        status: "ready",
        headline: analysis.headline,
        severity: analysis.severity,
        situasi: analysis.situasi,
        analisa: analysis.analisa,
        risiko: analysis.risiko,
        solusi: analysis.solusi as never,
        rekomendasi: analysis.rekomendasi,
        hasil_diharapkan: analysis.hasil_diharapkan,
        signals: snapshot as never,
        model_note: analysis.notes.length > 0 ? analysis.notes.join(" | ") : null,
        error_detail: null,
        generated_at: new Date().toISOString(),
      })
      .eq("id", briefingId);
    if (updateError) throw new Error(`Gagal menyimpan briefing: ${updateError.message}`);

    if (analysis.actions.length > 0) {
      const { error: actionsError } = await supabase.from("friday_actions").insert(
        analysis.actions.map((action) => ({
          briefing_id: briefingId,
          action_key: action.action_key,
          title: action.title,
          rationale: action.rationale,
          risk_tier: resolveRiskTier(action.action_key),
          payload: action.payload as never,
        })),
      );
      // The analysis itself is already saved and useful. Losing the proposed
      // actions is a degradation worth logging, not a reason to fail a
      // briefing that leadership can still read and act on manually.
      if (actionsError) {
        logger.error("FRIDAY failed to persist proposed actions", { briefingId, error: actionsError.message });
      }
    }

    logger.info("FRIDAY briefing ready", {
      briefingId,
      severity: analysis.severity,
      solutions: analysis.solusi.length,
      actions: analysis.actions.length,
      degraded: analysis.notes.length,
    });

    return { briefingId, severity: analysis.severity, solutions: analysis.solusi.length, actions: analysis.actions.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("friday_briefings").update({ status: "failed", error_detail: message }).eq("id", briefingId);
    throw err;
  }
}

/**
 * Risk tier is read from the catalog, never from the model — a model that
 * could label its own action "low" could talk its way past the warning the
 * approver sees.
 */
function resolveRiskTier(actionKey: string): "low" | "medium" | "high" {
  return RISK_BY_KEY.get(actionKey) ?? "medium";
}
