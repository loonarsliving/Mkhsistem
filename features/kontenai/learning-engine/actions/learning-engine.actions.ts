"use server";

import type { LearningRecord } from "@/features/kontenai/types";
import type { LearningSummary, LearningTheme } from "@/features/kontenai/learning-engine/types";

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
 * decision for this build phase, everything below is a seeded in-memory
 * mock. Swap the body of listLearningRecordsAction for a real query once
 * a `kontenai_learning_records` table (keyed on pipeline_run_id) lands.
 */

const MOCK_LEARNING_RECORDS: LearningRecord[] = [
  {
    id: "lrn-001",
    pipelineRunId: "run-1042",
    finalScore: 8.7,
    verdict: "approved",
    whatWorked: [
      "Hook di 2 detik pertama kuat",
      "CTA jelas dan sesuai KPI",
      "Warna brand konsisten di setiap scene",
    ],
    whatToImprove: ["Durasi total sedikit lebih panjang dari benchmark platform"],
    createdAt: "2026-07-01T09:12:00.000Z",
  },
  {
    id: "lrn-002",
    pipelineRunId: "run-1043",
    finalScore: 5.4,
    verdict: "needs_revision",
    whatWorked: ["Visual aset relevan dengan niche"],
    whatToImprove: [
      "Transisi scene ke-3 terlalu cepat",
      "Teks overlay sulit terbaca di 1 detik terakhir",
      "Hook belum menonjolkan value utama",
    ],
    createdAt: "2026-07-02T10:05:00.000Z",
  },
  {
    id: "lrn-003",
    pipelineRunId: "run-1044",
    finalScore: 9.1,
    verdict: "approved",
    whatWorked: [
      "Hook di 2 detik pertama kuat",
      "Storyboard mengalir natural antar scene",
      "Musik dan pacing sinkron dengan mood konten",
    ],
    whatToImprove: [],
    createdAt: "2026-07-03T08:40:00.000Z",
  },
  {
    id: "lrn-004",
    pipelineRunId: "run-1045",
    finalScore: 4.8,
    verdict: "needs_revision",
    whatWorked: ["CTA jelas dan sesuai KPI"],
    whatToImprove: [
      "Transisi scene ke-3 terlalu cepat",
      "Narrative angle kurang selaras dengan brief",
      "Aset video beresolusi rendah di scene pembuka",
    ],
    createdAt: "2026-07-04T14:22:00.000Z",
  },
  {
    id: "lrn-005",
    pipelineRunId: "run-1046",
    finalScore: 7.9,
    verdict: "approved",
    whatWorked: ["Warna brand konsisten di setiap scene", "Hook di 2 detik pertama kuat"],
    whatToImprove: ["Teks overlay sulit terbaca di 1 detik terakhir"],
    createdAt: "2026-07-05T11:15:00.000Z",
  },
  {
    id: "lrn-006",
    pipelineRunId: "run-1047",
    finalScore: 3.6,
    verdict: "needs_revision",
    whatWorked: [],
    whatToImprove: [
      "Hook belum menonjolkan value utama",
      "CTA terasa generik, tidak spesifik ke promo",
      "Transisi scene ke-3 terlalu cepat",
      "Durasi terlalu panjang untuk format TikTok",
    ],
    createdAt: "2026-07-06T09:50:00.000Z",
  },
  {
    id: "lrn-007",
    pipelineRunId: "run-1048",
    finalScore: 8.2,
    verdict: "approved",
    whatWorked: ["Hook di 2 detik pertama kuat", "CTA jelas dan sesuai KPI", "Pemilihan aset sesuai tag storyboard"],
    whatToImprove: ["Musik kurang menonjolkan mood konten"],
    createdAt: "2026-07-07T13:30:00.000Z",
  },
  {
    id: "lrn-008",
    pipelineRunId: "run-1049",
    finalScore: 6.1,
    verdict: "needs_revision",
    whatWorked: ["Warna brand konsisten di setiap scene"],
    whatToImprove: ["Hook belum menonjolkan value utama", "Teks overlay sulit terbaca di 1 detik terakhir"],
    createdAt: "2026-07-08T10:00:00.000Z",
  },
  {
    id: "lrn-009",
    pipelineRunId: "run-1050",
    finalScore: 9.4,
    verdict: "approved",
    whatWorked: [
      "Hook di 2 detik pertama kuat",
      "Storyboard mengalir natural antar scene",
      "CTA jelas dan sesuai KPI",
    ],
    whatToImprove: [],
    createdAt: "2026-07-09T16:05:00.000Z",
  },
  {
    id: "lrn-010",
    pipelineRunId: "run-1051",
    finalScore: 2.9,
    verdict: "needs_revision",
    whatWorked: [],
    whatToImprove: [
      "Transisi scene ke-3 terlalu cepat",
      "Narrative angle kurang selaras dengan brief",
      "Hook belum menonjolkan value utama",
    ],
    createdAt: "2026-07-10T09:18:00.000Z",
  },
  {
    id: "lrn-011",
    pipelineRunId: "run-1052",
    finalScore: 7.3,
    verdict: "approved",
    whatWorked: ["CTA jelas dan sesuai KPI", "Pemilihan aset sesuai tag storyboard"],
    whatToImprove: ["Durasi total sedikit lebih panjang dari benchmark platform"],
    createdAt: "2026-07-11T12:44:00.000Z",
  },
  {
    id: "lrn-012",
    pipelineRunId: "run-1053",
    finalScore: 5.9,
    verdict: "needs_revision",
    whatWorked: ["Hook di 2 detik pertama kuat"],
    whatToImprove: ["CTA terasa generik, tidak spesifik ke promo", "Teks overlay sulit terbaca di 1 detik terakhir"],
    createdAt: "2026-07-12T08:27:00.000Z",
  },
  {
    id: "lrn-013",
    pipelineRunId: "run-1054",
    finalScore: 8.9,
    verdict: "approved",
    whatWorked: [
      "Hook di 2 detik pertama kuat",
      "Warna brand konsisten di setiap scene",
      "Musik dan pacing sinkron dengan mood konten",
    ],
    whatToImprove: [],
    createdAt: "2026-07-13T15:12:00.000Z",
  },
  {
    id: "lrn-014",
    pipelineRunId: "run-1055",
    finalScore: 4.2,
    verdict: "needs_revision",
    whatWorked: ["Pemilihan aset sesuai tag storyboard"],
    whatToImprove: [
      "Aset video beresolusi rendah di scene pembuka",
      "Hook belum menonjolkan value utama",
      "Narrative angle kurang selaras dengan brief",
    ],
    createdAt: "2026-07-14T11:36:00.000Z",
  },
  {
    id: "lrn-015",
    pipelineRunId: "run-1056",
    finalScore: 7.6,
    verdict: "approved",
    whatWorked: ["Storyboard mengalir natural antar scene", "CTA jelas dan sesuai KPI"],
    whatToImprove: ["Musik kurang menonjolkan mood konten"],
    createdAt: "2026-07-15T09:58:00.000Z",
  },
  {
    id: "lrn-016",
    pipelineRunId: "run-1057",
    finalScore: 6.7,
    verdict: "approved",
    whatWorked: ["Hook di 2 detik pertama kuat", "Warna brand konsisten di setiap scene"],
    whatToImprove: ["Durasi total sedikit lebih panjang dari benchmark platform"],
    createdAt: "2026-07-16T14:03:00.000Z",
  },
  {
    id: "lrn-017",
    pipelineRunId: "run-1058",
    finalScore: 3.1,
    verdict: "needs_revision",
    whatWorked: [],
    whatToImprove: [
      "Transisi scene ke-3 terlalu cepat",
      "CTA terasa generik, tidak spesifik ke promo",
      "Teks overlay sulit terbaca di 1 detik terakhir",
    ],
    createdAt: "2026-07-17T10:41:00.000Z",
  },
];

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

/** Returns the full seeded set of Learning Engine records, newest first. */
export async function listLearningRecordsAction(): Promise<LearningRecord[]> {
  await simulateLatency();
  return [...MOCK_LEARNING_RECORDS].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

/** Aggregates the seeded LearningRecords into summary stats for the dashboard header. */
export async function getLearningSummaryAction(): Promise<LearningSummary> {
  await simulateLatency();
  const records = MOCK_LEARNING_RECORDS;

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
