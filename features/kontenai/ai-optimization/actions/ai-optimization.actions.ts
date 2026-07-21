"use server";

import { getMockDb } from "@/features/kontenai/lib/mock-db";
import { generateId } from "@/features/kontenai/lib/ids";
import type { LearningRecord, OptimizationArea, OptimizationRecommendation } from "@/features/kontenai/types";

/**
 * Sprint 9 - AI Optimization.
 *
 * Mocked/in-memory only, per explicit project-owner decision for this
 * build phase: no real ML/analytics computation and no Supabase
 * persistence yet. This module reads Learning Engine records (Sprint 8)
 * out of the shared mock-db and proposes OptimizationRecommendations
 * back into a specific pipeline area (AI Director, Storyboard, Asset
 * Selection, Render) -- a human reviews each proposal and either applies
 * it or dismisses it via updateRecommendationStatusAction.
 *
 * Learning Engine populates `getMockDb().learningRecords` at runtime as
 * real pipeline runs finish (it starts empty); this module never seeds
 * its own copy of that data, and never fabricates a recommendation when
 * there isn't enough evidence to support one yet.
 */

/** Minimum number of learning records before we bother looking for patterns at all. */
const MIN_RECORDS_FOR_ANALYSIS = 3;

/** A theme is "supported" once at least this many records mention it. */
const MIN_SUPPORTING_RECORDS = 2;

interface ThemeDefinition {
  key: string;
  area: OptimizationArea;
  /** Case-insensitive keyword fragments checked against whatToImprove (and whatWorked for context). */
  keywords: string[];
  recommendation: (supportCount: number, sampleRunIds: string[]) => string;
  expectedImpact: string;
}

/**
 * Keyword/theme catalogue. Each theme maps a recurring phrase pattern
 * found in Learning Engine's `whatToImprove` bullets to the pipeline
 * area it should feed a recommendation back into. This is intentionally
 * simple substring/keyword matching -- no real NLP -- mirroring the
 * "naive phrase-frequency" approach Learning Engine itself uses.
 */
const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    key: "cta_generic",
    area: "ai_director",
    keywords: ["cta terasa generik", "cta generik", "cta kurang", "cta belum"],
    recommendation: (count, runIds) =>
      `${count} learning record menunjukkan CTA yang dihasilkan AI Director terasa generik / tidak spesifik ke promo (contoh run: ${runIds.join(", ")}). Sarankan AI Director menghasilkan variasi CTA berbasis urgensi/promo spesifik alih-alih copy generik.`,
    expectedImpact: "Perkiraan kenaikan CTA score dan CTR CTA pada konten berikutnya.",
  },
  {
    key: "hook_weak",
    area: "ai_director",
    keywords: ["hook belum menonjolkan value", "hook belum", "hook kurang"],
    recommendation: (count, runIds) =>
      `${count} learning record mencatat hook belum menonjolkan value utama konten (contoh run: ${runIds.join(", ")}). Sarankan AI Director memperkuat framing value/benefit utama di narrative angle pada 2 detik pertama.`,
    expectedImpact: "Perkiraan kenaikan hook score dan retention 3 detik pertama.",
  },
  {
    key: "narrative_misaligned",
    area: "ai_director",
    keywords: ["narrative angle kurang selaras"],
    recommendation: (count, runIds) =>
      `${count} learning record menunjukkan narrative angle yang dihasilkan AI Director kurang selaras dengan brief (contoh run: ${runIds.join(", ")}). Sarankan penambahan validasi keselarasan brief-angle sebelum directive difinalisasi.`,
    expectedImpact: "Perkiraan penurunan tingkat needs_revision terkait narrative angle.",
  },
  {
    key: "transition_pacing",
    area: "storyboard",
    keywords: ["transisi scene", "transisi terlalu cepat", "durasi total", "durasi terlalu panjang"],
    recommendation: (count, runIds) =>
      `${count} learning record menyebut masalah timing/transisi antar scene atau durasi total storyboard (contoh run: ${runIds.join(", ")}). Sarankan Storyboard Engine meninjau ulang pacing transisi dan benchmark durasi per platform.`,
    expectedImpact: "Perkiraan kenaikan video completion rate dan penurunan revisi terkait pacing.",
  },
  {
    key: "text_overlay_readability",
    area: "storyboard",
    keywords: ["teks overlay sulit terbaca", "text overlay"],
    recommendation: (count, runIds) =>
      `${count} learning record mencatat teks overlay sulit terbaca di scene closing (contoh run: ${runIds.join(", ")}). Sarankan Storyboard Engine menstandarkan durasi tampil dan kontras teks overlay pada scene closing/CTA.`,
    expectedImpact: "Perkiraan kenaikan CTA score dan keterbacaan overlay pada scene closing.",
  },
  {
    key: "asset_match_low_res",
    area: "asset_selection",
    keywords: ["aset video beresolusi rendah", "aset video resolusi rendah", "beresolusi rendah"],
    recommendation: (count, runIds) =>
      `${count} learning record menunjukkan aset video beresolusi rendah terpilih untuk scene pembuka (contoh run: ${runIds.join(", ")}). Sarankan Asset Selector memprioritaskan qualityScore minimum untuk scene hook.`,
    expectedImpact: "Perkiraan kenaikan hook score dan kualitas visual scene pembuka.",
  },
  {
    key: "asset_match_tag",
    area: "asset_selection",
    keywords: ["pemilihan aset sesuai tag", "asset sesuai tag storyboard"],
    recommendation: (count, runIds) =>
      `${count} learning record positif mencatat pemilihan aset sudah sesuai tag storyboard (contoh run: ${runIds.join(", ")}), namun pola ini belum konsisten di semua run. Sarankan Asset Selector mengunci aturan matching tag yang sudah terbukti berhasil sebagai default.`,
    expectedImpact: "Perkiraan konsistensi match score aset yang lebih tinggi across run.",
  },
  {
    key: "music_mood",
    area: "render",
    keywords: ["musik kurang menonjolkan mood", "musik dan pacing"],
    recommendation: (count, runIds) =>
      `${count} learning record menyoroti kesesuaian musik/pacing dengan mood konten saat proses render (contoh run: ${runIds.join(", ")}). Sarankan Render Engine menambahkan aturan pemilihan track berbasis mood contentFocus.`,
    expectedImpact: "Perkiraan kenaikan skor pengalaman menonton (watch-through) pada hasil render.",
  },
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function recordMentionsKeyword(record: LearningRecord, keywords: string[]): boolean {
  const haystack = [...record.whatToImprove, ...record.whatWorked].map(normalize);
  return haystack.some((bullet) => keywords.some((keyword) => bullet.includes(keyword)));
}

/**
 * Confidence scales with how much of the learning history actually
 * supports the theme: the fraction of records exhibiting the pattern,
 * boosted slightly by absolute sample size, capped at 0.9 so a mocked
 * heuristic never claims full certainty.
 */
function computeConfidence(supportCount: number, totalRecords: number): number {
  const coverage = totalRecords > 0 ? supportCount / totalRecords : 0;
  const sampleSizeBoost = Math.min(supportCount / 10, 0.15);
  const confidence = coverage * 0.75 + sampleSizeBoost;
  return Math.round(Math.min(confidence, 0.9) * 100) / 100;
}

/** True if two run-id lists represent the same underlying evidence set. */
function sameRunIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

/**
 * Analyzes the shared Learning Engine history for recurring themes and
 * appends any newly-detected recommendation (one per theme+area, only
 * if a "proposed" recommendation backed by the exact same evidence set
 * doesn't already exist) to the shared mock-db. `OptimizationRecommendation`
 * has no theme-id field (it's owned by the shared foundation and must
 * not be modified), so dedup instead compares `area` plus the deterministic
 * set of supporting `basedOnRunIds` a theme would produce against the
 * current data snapshot -- re-running analysis on unchanged data never
 * spams a duplicate proposal for the same theme.
 */
function analyzeAndAppendRecommendations(): void {
  const db = getMockDb();
  const records = db.learningRecords;

  if (records.length < MIN_RECORDS_FOR_ANALYSIS) {
    // Not enough evidence yet -- never fabricate a recommendation from thin air.
    return;
  }

  for (const theme of THEME_DEFINITIONS) {
    const supporting = records.filter((record) => recordMentionsKeyword(record, theme.keywords));
    if (supporting.length < MIN_SUPPORTING_RECORDS) continue;

    const supportingRunIds = supporting.map((record) => record.pipelineRunId);

    const alreadyProposed = db.optimizationRecommendations.some(
      (rec) => rec.area === theme.area && rec.status === "proposed" && sameRunIdSet(rec.basedOnRunIds, supportingRunIds),
    );
    if (alreadyProposed) continue;

    const sampleRunIds = supportingRunIds.slice(0, 3);
    const confidence = computeConfidence(supporting.length, records.length);

    const recommendation: OptimizationRecommendation = {
      id: generateId("opt"),
      area: theme.area,
      recommendation: theme.recommendation(supporting.length, sampleRunIds),
      expectedImpact: theme.expectedImpact,
      confidence,
      status: "proposed",
      basedOnRunIds: supportingRunIds,
      createdAt: new Date().toISOString(),
    };

    db.optimizationRecommendations.push(recommendation);
  }
}

/**
 * Returns all optimization recommendations, newest first. Analyzes
 * Learning Engine's accumulated records for recurring themes first (see
 * analyzeAndAppendRecommendations) so newly-detected patterns show up
 * without ever duplicating an already-proposed recommendation for the
 * same theme. If there isn't enough learning data yet, this simply
 * returns whatever recommendations already exist (possibly none).
 */
export async function listRecommendationsAction(): Promise<OptimizationRecommendation[]> {
  analyzeAndAppendRecommendations();
  const db = getMockDb();
  return [...db.optimizationRecommendations].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Applies or dismisses a proposed recommendation. Mutates the shared
 * mock-db in place (mocked persistence -- no Supabase writes in this
 * build phase) and returns the updated record.
 */
export async function updateRecommendationStatusAction(
  id: string,
  status: "applied" | "dismissed",
): Promise<OptimizationRecommendation> {
  const db = getMockDb();
  const index = db.optimizationRecommendations.findIndex((rec) => rec.id === id);
  if (index === -1) {
    throw new Error(`Optimization recommendation ${id} not found`);
  }
  const updated: OptimizationRecommendation = { ...db.optimizationRecommendations[index], status };
  db.optimizationRecommendations[index] = updated;
  return updated;
}
