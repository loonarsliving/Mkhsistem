"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/constants/rbac";
import { getFridayAction } from "@/lib/ai/friday/action-catalog";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { decideActionSchema, runBriefingSchema, type DecideActionInput, type RunBriefingInput } from "../schemas/friday.schema";

/**
 * The two write paths into FRIDAY, and the reason they are the only two.
 *
 * Analysis is produced by a background job; the console cannot write a
 * briefing, only ask for one. Actions are produced by that same job in the
 * 'proposed' state; the console cannot create one, only decide it. So the
 * complete set of things a browser can cause here is "run an analysis" and
 * "approve or reject something the analysis already proposed" — which is what
 * keeps FRIDAY's authority bounded by the catalog rather than by the UI.
 *
 * Both actions use the service-role client deliberately. friday_briefings and
 * friday_actions grant select-only to authenticated roles (migration 0179);
 * there is no RLS write path to use even if we wanted one. The permission
 * check at the top of each function is therefore the real gate, which is why
 * neither function accepts an actor id from the client.
 */

/** Enough of a gap that a double-click or an impatient re-click cannot queue two analyses; short enough that a genuine follow-up question is not blocked. */
const MANUAL_RUN_COOLDOWN_MS = 90_000;

export async function runFridayBriefingAction(input: RunBriefingInput): Promise<ActionResult<{ briefingId: string }>> {
  const session = await requirePermission(PERMISSIONS.FRIDAY_RUN);
  const parsed = runBriefingSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const question = parsed.data.question?.trim() || null;
  const supabase = createAdminClient();

  const { data: recent } = await supabase
    .from("friday_briefings")
    .select("id, created_at")
    .eq("requested_by", session.userId)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - MANUAL_RUN_COOLDOWN_MS).toISOString())
    .limit(1)
    .maybeSingle();
  if (recent) {
    return actionError("Analisa sebelumnya masih berjalan. Tunggu sebentar sampai hasilnya keluar.");
  }

  // Row first, then the job -- same ordering as friday_enqueue_daily_briefing()
  // in migration 0179, so a job that never runs leaves a visible failed
  // briefing instead of nothing at all.
  const { data: briefing, error: insertError } = await supabase
    .from("friday_briefings")
    .insert({ scope: "company", trigger_source: "manual", status: "pending", requested_by: session.userId })
    .select("id")
    .single();
  if (insertError || !briefing) {
    return actionError(`Gagal membuat permintaan analisa: ${insertError?.message ?? "tidak diketahui"}`);
  }

  const { error: queueError } = await supabase
    .from("ai_job_queue")
    .insert({ job_type: "friday_executive_briefing", payload: { briefing_id: briefing.id, question } as never });
  if (queueError) {
    await supabase.from("friday_briefings").update({ status: "failed", error_detail: `Gagal masuk antrian: ${queueError.message}` }).eq("id", briefing.id);
    return actionError(`Gagal menjalankan analisa: ${queueError.message}`);
  }

  revalidatePath("/friday");
  return actionSuccess({ briefingId: briefing.id });
}

/**
 * On-demand group briefing.
 *
 * Same shape as runFridayBriefingAction, one scope wider. Gated on
 * HOLDING_VIEW rather than FRIDAY_RUN: reading the group is what this
 * produces, and the group audience is not necessarily the same people who run
 * the company-level analysis.
 */
export async function runHoldingBriefingAction(input: RunBriefingInput): Promise<ActionResult<{ briefingId: string }>> {
  const session = await requirePermission(PERMISSIONS.HOLDING_VIEW);
  const parsed = runBriefingSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const question = parsed.data.question?.trim() || null;
  const supabase = createAdminClient();

  const { count: activeBusinesses } = await supabase.from("holding_businesses").select("id", { count: "exact", head: true }).eq("status", "active");
  if (!activeBusinesses) {
    return actionError("Belum ada unit bisnis aktif yang terdaftar di holding. Daftarkan minimal satu unit beserta connector-nya terlebih dahulu.");
  }

  const { data: recent } = await supabase
    .from("friday_briefings")
    .select("id")
    .eq("scope", "holding")
    .eq("requested_by", session.userId)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - MANUAL_RUN_COOLDOWN_MS).toISOString())
    .limit(1)
    .maybeSingle();
  if (recent) return actionError("Analisa grup sebelumnya masih berjalan. Tunggu sebentar sampai hasilnya keluar.");

  const { data: briefing, error: insertError } = await supabase
    .from("friday_briefings")
    .insert({ scope: "holding", trigger_source: "manual", status: "pending", requested_by: session.userId })
    .select("id")
    .single();
  if (insertError || !briefing) {
    return actionError(`Gagal membuat permintaan analisa grup: ${insertError?.message ?? "tidak diketahui"}`);
  }

  const { error: queueError } = await supabase
    .from("ai_job_queue")
    .insert({ job_type: "friday_holding_briefing", payload: { briefing_id: briefing.id, question } as never });
  if (queueError) {
    await supabase.from("friday_briefings").update({ status: "failed", error_detail: `Gagal masuk antrian: ${queueError.message}` }).eq("id", briefing.id);
    return actionError(`Gagal menjalankan analisa grup: ${queueError.message}`);
  }

  revalidatePath("/friday/holding");
  return actionSuccess({ briefingId: briefing.id });
}

export async function decideFridayActionAction(input: DecideActionInput): Promise<ActionResult<{ note: string }>> {
  const session = await requirePermission(PERMISSIONS.FRIDAY_ACTION_DECIDE);
  const parsed = decideActionSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = createAdminClient();
  const { actionId, decision } = parsed.data;
  const decidedAt = new Date().toISOString();

  if (decision === "reject") {
    const { data, error } = await supabase
      .from("friday_actions")
      .update({ status: "rejected", decided_by: session.userId, decided_at: decidedAt })
      .eq("id", actionId)
      .eq("status", "proposed")
      .select("id")
      .maybeSingle();
    if (error) return actionError(`Gagal menolak aksi: ${error.message}`);
    if (!data) return actionError("Aksi ini sudah diputuskan sebelumnya.");

    revalidatePath("/friday");
    return actionSuccess({ note: "Aksi ditolak." });
  }

  // Atomic claim: the update only matches while the row is still 'proposed',
  // so two approvers clicking at the same moment produce one execution and one
  // "already decided" message -- never the same WhatsApp blast sent twice.
  // Mirrors how app/api/ai/process-job claims a queue row.
  const { data: claimed, error: claimError } = await supabase
    .from("friday_actions")
    .update({ status: "approved", decided_by: session.userId, decided_at: decidedAt })
    .eq("id", actionId)
    .eq("status", "proposed")
    .select("id, action_key, title, payload")
    .maybeSingle();
  if (claimError) return actionError(`Gagal menyetujui aksi: ${claimError.message}`);
  if (!claimed) return actionError("Aksi ini sudah diputuskan sebelumnya.");

  const definition = getFridayAction(claimed.action_key);
  if (!definition) {
    // Only reachable if an action key is removed from the catalog while a
    // proposal referencing it is still open. Fail the row rather than
    // silently leaving it 'approved' but never run.
    await supabase
      .from("friday_actions")
      .update({ status: "failed", execution_note: `Aksi "${claimed.action_key}" tidak lagi tersedia di katalog MKH System` })
      .eq("id", actionId);
    revalidatePath("/friday");
    return actionError(`Aksi "${claimed.action_key}" tidak lagi tersedia di sistem.`);
  }

  const payload = typeof claimed.payload === "object" && claimed.payload !== null && !Array.isArray(claimed.payload) ? (claimed.payload as Record<string, unknown>) : {};

  try {
    const note = await definition.execute(supabase, payload, {
      approverId: session.userId,
      approverName: session.employee.full_name,
    });

    await supabase.from("friday_actions").update({ status: "executed", executed_at: new Date().toISOString(), execution_note: note }).eq("id", actionId);
    logger.info("FRIDAY action executed", { actionId, actionKey: claimed.action_key, approver: session.userId });

    revalidatePath("/friday");
    return actionSuccess({ note });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 'failed', not back to 'proposed': the decision was genuinely made and
    // must stay attributed to whoever made it. Re-proposing would erase that.
    await supabase.from("friday_actions").update({ status: "failed", execution_note: message }).eq("id", actionId);
    logger.error("FRIDAY action failed", { actionId, actionKey: claimed.action_key, error: message });

    revalidatePath("/friday");
    return actionError(`Aksi gagal dijalankan: ${message}`);
  }
}
