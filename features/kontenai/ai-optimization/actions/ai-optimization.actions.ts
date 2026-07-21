"use server";

import type { OptimizationRecommendation } from "@/features/kontenai/types";

/**
 * Sprint 9 - AI Optimization.
 *
 * Mocked/in-memory only, per explicit project-owner decision for this
 * build phase: no real ML/analytics computation and no Supabase
 * persistence yet. This module reads Learning Engine records (Sprint 8)
 * and Content Studio/Analytics performance patterns to propose
 * OptimizationRecommendations that close the production loop -- a human
 * reviews each proposal and either applies it (feeds back into AI
 * Director / Storyboard / Asset Selector / Render prompts and rules) or
 * dismisses it.
 */

let recommendations: OptimizationRecommendation[] = [
  {
    id: "opt-001",
    area: "ai_director",
    recommendation:
      "AI Director cenderung menghasilkan CTA generik (\"DM kami sekarang\") untuk konten leasehold_sales. Sarankan variasi CTA berbasis urgensi (\"Sisa 2 unit bulan ini\") berdasarkan pola konten dengan engagement tertinggi.",
    expectedImpact: "Perkiraan kenaikan CTR CTA 12-18% pada konten leasehold_sales di Instagram.",
    confidence: 0.82,
    status: "proposed",
    basedOnRunIds: ["run-1042", "run-1058", "run-1061"],
    createdAt: "2026-07-14T03:20:00.000Z",
  },
  {
    id: "opt-002",
    area: "storyboard",
    recommendation:
      "Storyboard untuk konten occupancy rata-rata memakai 6-7 scene dengan transisi \"cut\" saja. Learning record menunjukkan konten dengan variasi transisi (fade/zoom di scene closing) mendapat completion rate lebih tinggi.",
    expectedImpact: "Perkiraan kenaikan video completion rate 8-10% untuk konten occupancy di TikTok.",
    confidence: 0.68,
    status: "proposed",
    basedOnRunIds: ["run-1033", "run-1040"],
    createdAt: "2026-07-12T07:45:00.000Z",
  },
  {
    id: "opt-003",
    area: "asset_selection",
    recommendation:
      "Asset Selector sering memilih foto eksterior generik untuk scene \"hook\" pada konten beauty, walau tag hasil Gemini Vision menunjukkan foto before/after tersedia dan match score lebih tinggi.",
    expectedImpact: "Perkiraan kenaikan hook score (Content Audit) 0.5-1.0 poin dari skala 10 pada konten beauty.",
    confidence: 0.74,
    status: "proposed",
    basedOnRunIds: ["run-1027"],
    createdAt: "2026-07-10T11:05:00.000Z",
  },
  {
    id: "opt-004",
    area: "render",
    recommendation:
      "Render Engine konsisten memakai resolusi 1080x1920 untuk semua platform, padahal beberapa slot Instagram Feed lebih optimal di rasio 4:5. Sarankan aturan render otomatis berbasis targetPlatform + placement.",
    expectedImpact: "Mengurangi revisi manual crop pasca-render sekitar 15% dan mempercepat waktu publish.",
    confidence: 0.61,
    status: "proposed",
    basedOnRunIds: ["run-1019", "run-1022", "run-1030"],
    createdAt: "2026-07-08T09:30:00.000Z",
  },
  {
    id: "opt-005",
    area: "ai_director",
    recommendation:
      "Narrative angle yang dihasilkan AI Director untuk konten general kurang bervariasi antar minggu (pola \"lifestyle mewah\" berulang). Sarankan rotasi 4 angle berbeda berbasis performa hook mingguan.",
    expectedImpact: "Perkiraan penurunan audience fatigue dan kenaikan engagement rate 5-7% pada konten general.",
    confidence: 0.55,
    status: "applied",
    basedOnRunIds: ["run-0987", "run-1002"],
    createdAt: "2026-06-28T02:15:00.000Z",
  },
  {
    id: "opt-006",
    area: "storyboard",
    recommendation:
      "Scene pembuka (hook) pada storyboard leasehold_sales rata-rata berdurasi 4 detik, lebih panjang dari benchmark TikTok 2 detik untuk mempertahankan retention 3 detik pertama.",
    expectedImpact: "Perkiraan kenaikan retention 3 detik pertama sebesar 10-14%.",
    confidence: 0.79,
    status: "applied",
    basedOnRunIds: ["run-0965", "run-0971", "run-0980"],
    createdAt: "2026-06-25T13:40:00.000Z",
  },
  {
    id: "opt-007",
    area: "asset_selection",
    recommendation:
      "Asset Selector jarang memilih aset video pendek (durasi < 5 detik) untuk scene transisi, meski Learning record menunjukkan aset ini menghasilkan pacing yang disukai audiens beauty.",
    expectedImpact: "Perkiraan kenaikan watch-through rate 4-6% pada konten beauty.",
    confidence: 0.42,
    status: "dismissed",
    basedOnRunIds: ["run-0950"],
    createdAt: "2026-06-20T05:00:00.000Z",
  },
  {
    id: "opt-008",
    area: "render",
    recommendation:
      "Sarankan menurunkan bitrate render dari 12 Mbps ke 8 Mbps untuk konten TikTok guna mempercepat waktu render, berdasarkan asumsi platform akan mengkompres ulang.",
    expectedImpact: "Perkiraan mempercepat waktu render 20%, namun berisiko menurunkan kualitas visual pada scene gerak cepat.",
    confidence: 0.31,
    status: "dismissed",
    basedOnRunIds: ["run-0940"],
    createdAt: "2026-06-18T08:20:00.000Z",
  },
  {
    id: "opt-009",
    area: "ai_director",
    recommendation:
      "Key messages yang dihasilkan AI Director untuk konten occupancy terlalu berfokus pada fasilitas fisik, sementara Content Studio verdict \"needs_revision\" berulang kali menyebut kurangnya angle komunitas/lifestyle penghuni.",
    expectedImpact: "Perkiraan menurunkan tingkat needs_revision dari Content Studio sebesar 15-20% pada konten occupancy.",
    confidence: 0.71,
    status: "proposed",
    basedOnRunIds: ["run-1055", "run-1060", "run-1063"],
    createdAt: "2026-07-16T06:10:00.000Z",
  },
  {
    id: "opt-010",
    area: "storyboard",
    recommendation:
      "Storyboard konten general rata-rata tidak menyertakan text overlay pada scene closing (CTA), padahal konten dengan text overlay CTA di scene terakhir mencatat CTA score Content Audit lebih tinggi.",
    expectedImpact: "Perkiraan kenaikan CTA score 0.4-0.8 poin dari skala 10 pada konten general.",
    confidence: 0.66,
    status: "proposed",
    basedOnRunIds: ["run-1048", "run-1052"],
    createdAt: "2026-07-15T10:50:00.000Z",
  },
  {
    id: "opt-011",
    area: "asset_selection",
    recommendation:
      "Match score rata-rata untuk scene \"value\" pada konten leasehold_sales lebih rendah dari scene lain, mengindikasikan tag aset yang tersedia kurang lengkap untuk merepresentasikan fasilitas unggulan.",
    expectedImpact: "Perkiraan kenaikan match score rata-rata scene 0.1-0.15 poin setelah tagging aset diperkaya.",
    confidence: 0.58,
    status: "proposed",
    basedOnRunIds: ["run-1044"],
    createdAt: "2026-07-13T04:35:00.000Z",
  },
  {
    id: "opt-012",
    area: "render",
    recommendation:
      "Render job untuk konten dengan lebih dari 8 scene memiliki tingkat kegagalan (failed) lebih tinggi dari rata-rata. Sarankan batasan jumlah scene atau optimasi pipeline render untuk storyboard panjang.",
    expectedImpact: "Perkiraan menurunkan render failure rate 25-30% pada storyboard panjang (>8 scene).",
    confidence: 0.88,
    status: "applied",
    basedOnRunIds: ["run-0990", "run-1005", "run-1011", "run-1018"],
    createdAt: "2026-07-01T12:00:00.000Z",
  },
];

/** Returns all optimization recommendations, newest first. */
export async function listRecommendationsAction(): Promise<OptimizationRecommendation[]> {
  return [...recommendations].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Applies or dismisses a proposed recommendation. Mutates the
 * module-level in-memory array (mocked persistence -- no Supabase writes
 * in this build phase) and returns the updated record.
 */
export async function updateRecommendationStatusAction(
  id: string,
  status: "applied" | "dismissed",
): Promise<OptimizationRecommendation> {
  const index = recommendations.findIndex((rec) => rec.id === id);
  if (index === -1) {
    throw new Error(`Optimization recommendation ${id} not found`);
  }
  const updated: OptimizationRecommendation = { ...recommendations[index], status };
  recommendations = [...recommendations.slice(0, index), updated, ...recommendations.slice(index + 1)];
  return updated;
}
