"use server";

import type { LearningRecord, StudioVerdict } from "@/features/kontenai/types";
import type { LearningSummary, LearningTheme } from "@/features/kontenai/learning-engine/types";
import { getMockDb } from "@/features/kontenai/lib/mock-db";
import { generateId } from "@/features/kontenai/lib/ids";

/**
 * Sprint 8 - Learning Engine.
 *
 * Every finished PipelineRun (Sprint 7) is distilled here into a
 * LearningRecord: the final Content Studio score/verdict plus a short
 * "what worked" / "what to improve" list. This module accumulates that
 * production+feedback history so Sprint 9 (AI Optimization) can later
 * mine it for recommendations back into the earlier KontenAI stages.
 *
 * No Supabase table exists for this yet -- per the project owner's
 * decision for this build phase, everything below reads/writes the
 * shared `getMockDb().learningRecords` collection, which starts EMPTY
 * and is populated at runtime as Production Pipeline runs reach a
 * verdict and call recordLearningOutcomeAction.
 */

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

/** Returns the accumulated Learning Engine records, newest first. */
export async function listLearningRecordsAction(): Promise<LearningRecord[]> {
  await simulateLatency();
  const records = getMockDb().learningRecords;
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pick<T>(pool: T[], seed: number): T {
  return pool[seed % pool.length];
}

/**
 * Derives whatWorked/whatToImprove bullet lists from a score/verdict pair
 * using real score-band logic (instead of static copy). A small phrase
 * pool per band + a seed derived from the score keeps the wording varied
 * across records instead of looking copy-pasted.
 */
function deriveFeedback(
  finalScore: number | null,
  verdict: StudioVerdict | null,
): { whatWorked: string[]; whatToImprove: string[] } {
  const whatWorked: string[] = [];
  const whatToImprove: string[] = [];

  if (finalScore === null) {
    whatToImprove.push(
      "Belum ada skor Content Studio untuk run ini -- pastikan verdict dikirim sebelum ditutup sebagai learning record.",
    );
    return { whatWorked, whatToImprove };
  }

  // Seed for varying phrasing without needing an RNG dependency: derive a
  // stable-but-varied index from the score's decimal part.
  const seed = Math.round(finalScore * 10);
  const scoreLabel = finalScore.toFixed(1);

  if (finalScore >= 8.5) {
    const strongPool = [
      `Skor tinggi (${scoreLabel}/10), hook dan value dianggap kuat`,
      `Skor ${scoreLabel}/10 -- di atas ambang auto-publish, storyboard dan CTA solid`,
      `Konten ini menembus ${scoreLabel}/10, hook 2 detik pertama dan pacing sudah matang`,
    ];
    whatWorked.push(pick(strongPool, seed));
    whatWorked.push(
      pick(
        [
          "Pemilihan aset selaras dengan tag storyboard dan brand color konsisten",
          "Transisi antar-scene mengalir natural, tidak ada friksi di alur cerita",
          "CTA jelas dan sejalan dengan target KPI brief",
        ],
        seed + 1,
      ),
    );
    if (verdict === "approved") {
      whatWorked.push("Verdict Content Studio: approved, siap dipublikasikan tanpa revisi tambahan");
    }
    whatToImprove.push(
      pick(
        [
          "Tetap pantau durasi total agar tidak melebihi benchmark platform di iterasi berikutnya",
          "Pertahankan formula ini, uji variasi musik/pacing kecil untuk A/B insight",
        ],
        seed + 2,
      ),
    );
  } else if (finalScore >= 6) {
    whatWorked.push(
      pick(
        [
          `Skor ${scoreLabel}/10 -- solid tapi masih di bawah ambang auto-publish (8.5)`,
          `Skor ${scoreLabel}/10, sebagian elemen (hook atau CTA) sudah cukup kuat`,
        ],
        seed,
      ),
    );
    whatToImprove.push(
      pick(
        [
          "Beberapa elemen borderline: hook atau transisi scene perlu dipertajam agar naik ke band approved",
          "Skor masih di zona abu-abu -- cek kembali kejelasan CTA dan keterbacaan teks overlay",
          "Perlu penyesuaian kecil di pacing atau narrative angle sebelum layak auto-publish",
        ],
        seed + 1,
      ),
    );
    if (verdict === "needs_revision") {
      whatToImprove.push(
        `Perlu revisi arahan atau storyboard, skor ${scoreLabel}/10 di bawah ambang auto-publish (8.5)`,
      );
    } else {
      whatWorked.push("Verdict Content Studio: approved meski skor masih di band menengah");
    }
  } else {
    whatToImprove.push(
      pick(
        [
          `Perlu revisi arahan atau storyboard, skor ${scoreLabel}/10 di bawah ambang auto-publish (8.5)`,
          `Skor ${scoreLabel}/10 tergolong rendah -- hook belum menonjolkan value utama`,
          `Skor ${scoreLabel}/10, narrative angle dan CTA perlu dirombak sebelum render ulang`,
        ],
        seed,
      ),
    );
    whatToImprove.push(
      pick(
        [
          "Transisi antar-scene terasa terlalu cepat atau tidak sinkron dengan aset",
          "Teks overlay atau CTA kurang jelas terbaca dalam durasi singkat",
          "Aset yang dipilih kurang relevan dengan brief atau tag storyboard",
        ],
        seed + 1,
      ),
    );
    if (finalScore >= 4) {
      whatWorked.push(
        pick(
          ["Ada elemen dasar yang terpakai dengan baik (aset atau warna brand), tinggal diperkuat konteksnya"],
          seed + 2,
        ),
      );
    }
  }

  return { whatWorked, whatToImprove };
}

/**
 * Records the outcome of a finished PipelineRun as a LearningRecord.
 * Called by Production Pipeline (Sprint 7) once a run reaches a verdict
 * (approved or needs_revision). Derives whatWorked/whatToImprove from the
 * score/verdict itself, appends to the shared mock-db collection, and
 * returns the created record.
 */
export async function recordLearningOutcomeAction(input: {
  pipelineRunId: string;
  finalScore: number | null;
  verdict: StudioVerdict | null;
}): Promise<LearningRecord> {
  await simulateLatency();

  const { whatWorked, whatToImprove } = deriveFeedback(input.finalScore, input.verdict);

  const record: LearningRecord = {
    id: generateId("learning"),
    pipelineRunId: input.pipelineRunId,
    finalScore: input.finalScore,
    verdict: input.verdict,
    whatWorked,
    whatToImprove,
    createdAt: new Date().toISOString(),
  };

  getMockDb().learningRecords.push(record);

  return record;
}

/**
 * Naive phrase-frequency counter over a list of bullet strings -- good
 * enough to surface recurring themes without any real NLP/ML, and easy
 * for Sprint 9 to later replace with a smarter clustering pass.
 */
function topPhrases(lists: string[][], limit: number): LearningTheme[] {
  const counts = new Map<string, number>();
  for (const bullets of lists) {
    for (const phrase of bullets) {
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase))
    .slice(0, limit);
}

/** Aggregates the accumulated LearningRecords into summary stats for the dashboard header. */
export async function getLearningSummaryAction(): Promise<LearningSummary> {
  await simulateLatency();
  const records = getMockDb().learningRecords;

  if (records.length === 0) {
    return {
      totalRecords: 0,
      averageScore: 0,
      approvalRate: 0,
      topWhatWorked: [],
      topWhatToImprove: [],
    };
  }

  const scored = records.filter((r): r is LearningRecord & { finalScore: number } => r.finalScore !== null);
  const averageScore = scored.length > 0 ? scored.reduce((sum, r) => sum + r.finalScore, 0) / scored.length : 0;

  const verdicted = records.filter((r) => r.verdict !== null);
  const approvedCount = verdicted.filter((r) => r.verdict === "approved").length;
  const approvalRate = verdicted.length > 0 ? approvedCount / verdicted.length : 0;

  return {
    totalRecords: records.length,
    averageScore: Math.round(averageScore * 10) / 10,
    approvalRate: Math.round(approvalRate * 1000) / 1000,
    topWhatWorked: topPhrases(
      records.map((r) => r.whatWorked),
      3,
    ),
    topWhatToImprove: topPhrases(
      records.map((r) => r.whatToImprove),
      3,
    ),
  };
}
