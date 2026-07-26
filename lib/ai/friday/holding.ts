import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAIText } from "@/lib/ai/service";

import { FRIDAY_ACTIONS } from "./action-catalog";
import {
  extractJsonObject,
  parseActions,
  parseSolutions,
  readText,
  requireText,
  SEVERITIES,
  FridayAnalysisError,
  type FridayAnalysis,
  type FridaySeverity,
} from "./analyst";
import { captureHoldingSnapshots } from "./connectors/registry";
import type { BusinessSnapshot } from "./connectors/types";
import { buildHoldingSystemPrompt, renderHoldingSnapshotForPrompt } from "./holding-prompt";

/**
 * The holding briefing — the same Brain, reading the group instead of one unit.
 *
 * Compatibility is the point of this file's shape. It reuses analyst.ts's
 * parsing wholesale (extractJsonObject, parseSolutions, parseActions and the
 * required-section rules) rather than re-deriving them, so the seven sections
 * of a group briefing are validated exactly as strictly as a single-business
 * one, and land in the same friday_briefings columns. `business_health` is the
 * only genuinely new field, and it lives in its own jsonb column.
 *
 * Nothing here touches the existing company-scope path. processFridayExecutiveBriefing
 * still runs unchanged, still reads MKH System directly, and still produces the
 * briefing it produced before the holding layer existed.
 */

export type BusinessHealthStatus = "sehat" | "perlu_perhatian" | "kritis" | "data_tidak_tersedia";

export interface BusinessHealthEntry {
  business_key: string;
  status: BusinessHealthStatus;
  ringkasan: string;
  temuan_utama: string;
  prioritas: number;
}

export interface HoldingAnalysis extends FridayAnalysis {
  businessHealth: BusinessHealthEntry[];
}

export interface FridayHoldingBriefingJobPayload {
  briefing_id: string;
  question?: string | null;
}

const HEALTH_STATUSES: readonly string[] = ["sehat", "perlu_perhatian", "kritis", "data_tidak_tersedia"];

/**
 * Cross-checks the model's per-business verdicts against what the connectors
 * actually returned.
 *
 * Two corrections are applied, and both exist because the same mistake at
 * group level is far more damaging than at unit level:
 *
 *   1. A business whose connector said 'unreachable' is FORCED to
 *      'data_tidak_tersedia', whatever the model wrote. The prompt forbids
 *      calling an unreadable business a failing one; this makes that
 *      unenforceable-by-instruction rule actually enforced. Declaring a unit
 *      "kritis" because its dashboard was down is precisely the error that
 *      would destroy leadership's trust in the group report.
 *   2. A business present in the snapshot but absent from the model's list is
 *      appended rather than silently dropped, so the group report is never
 *      quietly missing a unit.
 */
function parseBusinessHealth(raw: unknown, snapshots: BusinessSnapshot[], notes: string[]): BusinessHealthEntry[] {
  const byKey = new Map(snapshots.map((s) => [s.businessKey, s]));
  const entries: BusinessHealthEntry[] = [];
  const seen = new Set<string>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const key = readText(row, "business_key");
      if (!key) continue;

      const snapshot = byKey.get(key);
      if (!snapshot) {
        notes.push(`Unit "${key}" disebut AI tapi tidak ada di snapshot — diabaikan.`);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);

      const statusRaw = readText(row, "status").toLowerCase();
      let status: BusinessHealthStatus = HEALTH_STATUSES.includes(statusRaw) ? (statusRaw as BusinessHealthStatus) : "data_tidak_tersedia";

      if (snapshot.health === "unreachable" && status !== "data_tidak_tersedia") {
        notes.push(`Unit "${key}" datanya tidak terbaca tapi AI menilainya "${status}" — dikoreksi menjadi "data_tidak_tersedia".`);
        status = "data_tidak_tersedia";
      }

      const prioritas = typeof row.prioritas === "number" && Number.isFinite(row.prioritas) ? Math.trunc(row.prioritas) : entries.length + 1;

      entries.push({
        business_key: key,
        status,
        ringkasan: readText(row, "ringkasan") || "(tidak disebutkan)",
        temuan_utama: readText(row, "temuan_utama") || "(tidak disebutkan)",
        prioritas,
      });
    }
  } else {
    notes.push('Bagian "business_health" tidak berupa daftar.');
  }

  for (const snapshot of snapshots) {
    if (seen.has(snapshot.businessKey)) continue;
    notes.push(`Unit "${snapshot.businessKey}" tidak dinilai oleh AI — ditambahkan tanpa penilaian.`);
    entries.push({
      business_key: snapshot.businessKey,
      status: snapshot.health === "unreachable" ? "data_tidak_tersedia" : "perlu_perhatian",
      ringkasan: "Tidak dinilai dalam analisa ini.",
      temuan_utama: snapshot.note ?? "(tidak disebutkan)",
      prioritas: entries.length + 1,
    });
  }

  return entries.sort((a, b) => a.prioritas - b.prioritas);
}

function parseHoldingAnalysis(text: string, snapshots: BusinessSnapshot[]): HoldingAnalysis {
  const parsed = extractJsonObject(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new FridayAnalysisError("Keluaran AI bukan objek JSON");
  }
  const root = parsed as Record<string, unknown>;
  const notes: string[] = [];

  const severityRaw = readText(root, "severity").toLowerCase();
  if (severityRaw && !SEVERITIES.includes(severityRaw)) {
    notes.push(`Severity "${severityRaw}" tidak dikenal — dianggap "perhatian".`);
  }

  const headline = readText(root, "headline");

  return {
    headline: headline || requireText(root, "situasi").split(". ")[0].slice(0, 120),
    severity: (SEVERITIES.includes(severityRaw) ? severityRaw : "perhatian") as FridaySeverity,
    situasi: requireText(root, "situasi"),
    analisa: requireText(root, "analisa"),
    risiko: requireText(root, "risiko"),
    solusi: parseSolutions(root.solusi, notes),
    rekomendasi: requireText(root, "rekomendasi"),
    hasil_diharapkan: readText(root, "hasil_diharapkan") || "(tidak disebutkan)",
    actions: parseActions(root.actions, notes),
    businessHealth: parseBusinessHealth(root.business_health, snapshots, notes),
    notes,
  };
}

/** Exported for tests — the group-level corrections above are the part worth testing without a live model. */
export const __holdingTestables = { parseHoldingAnalysis, parseBusinessHealth };

export async function runHoldingAnalysis(
  snapshots: BusinessSnapshot[],
  opts?: { question?: string | null; jobId?: string },
): Promise<HoldingAnalysis> {
  const periodLabel = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar",
  });

  const focus = opts?.question?.trim()
    ? `PERTANYAAN SPESIFIK DARI PIMPINAN HOLDING — jadikan fokus utama, tapi tetap baca seluruh unit untuk mencari pola lintas bisnis:\n"${opts.question.trim()}"`
    : "Tidak ada pertanyaan spesifik. Ini briefing eksekutif grup: tentukan sendiri hal terpenting yang harus diketahui Direksi tentang grup hari ini.";

  const response = await generateAIText({
    systemPrompt: buildHoldingSystemPrompt(FRIDAY_ACTIONS),
    userPrompt: `${renderHoldingSnapshotForPrompt(snapshots, periodLabel)}\n\n---\n${focus}\n\nBalas HANYA dengan JSON sesuai kontrak.`,
    // Larger than the single-business budget: the output now carries one
    // business_health entry per unit on top of the seven sections, and a group
    // report truncated mid-JSON is a failed briefing rather than a short one.
    maxOutputTokens: 8192,
    jobId: opts?.jobId,
  });

  return parseHoldingAnalysis(response.text, snapshots);
}

/**
 * Fills one pending holding briefing.
 *
 * Mirrors processFridayExecutiveBriefing's contract exactly — row already
 * exists, failures are recorded on the row AND rethrown so the queue still
 * retries, an already-'ready' row is never overwritten. Same guarantees, wider
 * scope.
 */
export async function processFridayHoldingBriefing(payload: FridayHoldingBriefingJobPayload, jobId?: string) {
  const supabase = createAdminClient();
  const briefingId = payload.briefing_id;
  if (!briefingId) throw new Error("friday_holding_briefing job tanpa briefing_id");

  const { data: briefing, error: loadError } = await supabase.from("friday_briefings").select("id, status").eq("id", briefingId).maybeSingle();
  if (loadError) throw new Error(`Gagal memuat briefing ${briefingId}: ${loadError.message}`);
  if (!briefing) throw new Error(`Briefing ${briefingId} tidak ditemukan`);
  if (briefing.status === "ready") return { briefingId, skipped: "already_ready" as const };

  try {
    const snapshots = await captureHoldingSnapshots();
    if (snapshots.length === 0) {
      throw new Error("Tidak ada unit bisnis aktif terdaftar di holding_businesses — tidak ada yang bisa dianalisa");
    }

    const analysis = await runHoldingAnalysis(snapshots, { question: payload.question ?? null, jobId });

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
        business_health: analysis.businessHealth as never,
        signals: { businesses: snapshots } as never,
        model_note: analysis.notes.length > 0 ? analysis.notes.join(" | ") : null,
        error_detail: null,
        generated_at: new Date().toISOString(),
      })
      .eq("id", briefingId);
    if (updateError) throw new Error(`Gagal menyimpan briefing holding: ${updateError.message}`);

    if (analysis.actions.length > 0) {
      const riskByKey = new Map(FRIDAY_ACTIONS.map((a) => [a.key, a.riskTier]));
      const { error: actionsError } = await supabase.from("friday_actions").insert(
        analysis.actions.map((action) => ({
          briefing_id: briefingId,
          action_key: action.action_key,
          title: action.title,
          rationale: action.rationale,
          risk_tier: riskByKey.get(action.action_key) ?? "medium",
          payload: action.payload as never,
        })),
      );
      if (actionsError) logger.error("FRIDAY failed to persist holding actions", { briefingId, error: actionsError.message });
    }

    const unreachable = snapshots.filter((s) => s.health === "unreachable").length;
    logger.info("FRIDAY holding briefing ready", {
      briefingId,
      businesses: snapshots.length,
      unreachable,
      severity: analysis.severity,
      actions: analysis.actions.length,
      degraded: analysis.notes.length,
    });

    return { briefingId, businesses: snapshots.length, unreachable, severity: analysis.severity, actions: analysis.actions.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("friday_briefings").update({ status: "failed", error_detail: message }).eq("id", briefingId);
    throw err;
  }
}
