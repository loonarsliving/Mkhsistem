"use server";

import { revalidatePath } from "next/cache";

import type { PipelineStage, StudioVerdict } from "@/features/kontenai/types";
import { requirePermission } from "@/lib/rbac/session";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { STAGE_LABELS, type PipelineRunView } from "../types";

/**
 * Sprint 7 - Production Pipeline. Mocked/in-memory only, per explicit
 * project-owner decision for this build phase: no real Content Studio
 * integration and no real calls into the other KontenAI sprints. This
 * store lives for the lifetime of the server process/module instance,
 * which is enough to demo the orchestration + revision feedback loop.
 */

const NEXT_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  brief: "directive",
  directive: "storyboard",
  storyboard: "asset_selection",
  asset_selection: "render",
  render: "studio_review",
};

/** Where a run goes when Content Studio asks for a revision. Storyboard is
 * the earliest stage that's cheap to redo without re-running AI Director. */
const REVISION_TARGET_STAGE: PipelineStage = "storyboard";

const runs: PipelineRunView[] = seedRuns();

function seedRuns(): PipelineRunView[] {
  return [
    {
      id: "run-001",
      contentBriefId: "brief-001",
      currentStage: "published",
      status: "approved",
      revisionCount: 1,
      directiveId: "directive-001",
      storyboardId: "storyboard-001",
      renderJobId: "render-001",
      contentStudioScore: 9.1,
      contentStudioVerdict: "approved",
      brief: {
        id: "brief-001",
        kpiTaskId: "kpi-task-101",
        title: "Promo Diskon Sewa Kos Bulanan Juli",
        description: "Konten promo diskon 15% untuk sewa bulanan, target closing sebelum akhir bulan.",
        contentFocus: "leasehold_sales",
        targetPlatform: "instagram",
        branchId: "branch-jogja-01",
        divisionId: "division-markom",
        dueDate: "2026-07-22",
        auditInsight: {
          narrative: "Konten promo minggu lalu unggul di hook tapi lemah di CTA.",
          scores: { hook: 8.4, value: 7.6, cta: 6.1, nicheFit: 8.0, engagementPotential: 7.8, platformOptimization: 8.2, overall: 7.7 },
          growthSignal: "on_track",
          recommendations: ["Perkuat CTA dengan urgensi waktu", "Tambahkan testimoni penyewa"],
        },
      },
      history: [
        { stage: "brief", at: "2026-07-14T02:00:00.000Z", note: "Brief diterima dari Content Planner" },
        { stage: "directive", at: "2026-07-14T03:15:00.000Z", note: "AI Director menyusun arahan produksi" },
        { stage: "storyboard", at: "2026-07-14T05:30:00.000Z" },
        { stage: "asset_selection", at: "2026-07-15T01:00:00.000Z" },
        { stage: "render", at: "2026-07-15T02:45:00.000Z" },
        { stage: "studio_review", at: "2026-07-15T06:00:00.000Z", note: "Dikirim ke Content Studio" },
        { stage: "revision", at: "2026-07-15T09:20:00.000Z", note: "Content Studio minta revisi (skor 6.8) - kembali ke Storyboard" },
        { stage: "storyboard", at: "2026-07-16T01:00:00.000Z", note: "Storyboard disusun ulang berdasarkan feedback" },
        { stage: "asset_selection", at: "2026-07-16T02:30:00.000Z" },
        { stage: "render", at: "2026-07-16T04:00:00.000Z" },
        { stage: "studio_review", at: "2026-07-16T07:10:00.000Z", note: "Dikirim ulang ke Content Studio" },
        { stage: "published", at: "2026-07-16T10:00:00.000Z", note: "Content Studio approve (skor 9.1)" },
      ],
    },
    {
      id: "run-002",
      contentBriefId: "brief-002",
      currentStage: "storyboard",
      status: "in_progress",
      revisionCount: 0,
      directiveId: "directive-002",
      storyboardId: null,
      renderJobId: null,
      contentStudioScore: null,
      contentStudioVerdict: null,
      brief: {
        id: "brief-002",
        kpiTaskId: "kpi-task-102",
        title: "Testimoni Penghuni Kos Sultan Agung",
        description: "Video testimoni singkat 30 detik untuk TikTok.",
        contentFocus: "leasehold_sales",
        targetPlatform: "tiktok",
        branchId: "branch-jogja-02",
        divisionId: "division-markom",
        dueDate: "2026-07-25",
        auditInsight: null,
      },
      history: [
        { stage: "brief", at: "2026-07-18T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-18T02:20:00.000Z", note: "Narrative angle: testimoni otentik penghuni" },
        { stage: "storyboard", at: "2026-07-19T01:00:00.000Z", note: "Sedang menyusun urutan scene" },
      ],
    },
    {
      id: "run-003",
      contentBriefId: "brief-003",
      currentStage: "asset_selection",
      status: "in_progress",
      revisionCount: 0,
      directiveId: "directive-003",
      storyboardId: "storyboard-003",
      renderJobId: null,
      contentStudioScore: null,
      contentStudioVerdict: null,
      brief: {
        id: "brief-003",
        kpiTaskId: "kpi-task-103",
        title: "Tips Rawat Kulit Musim Panas - Loonars Beauty",
        description: "Carousel edukasi 5 slide untuk Instagram.",
        contentFocus: "beauty",
        targetPlatform: "instagram",
        branchId: "branch-jogja-01",
        divisionId: "division-loonars-beauty",
        dueDate: "2026-07-24",
        auditInsight: {
          narrative: "Konten edukasi skincare konsisten performa baik.",
          scores: { hook: 7.9, value: 8.6, cta: 7.2, nicheFit: 8.8, engagementPotential: 8.1, platformOptimization: 8.0, overall: 8.1 },
          growthSignal: "excellent",
          recommendations: ["Pertahankan format carousel edukasi"],
        },
      },
      history: [
        { stage: "brief", at: "2026-07-17T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-17T02:00:00.000Z" },
        { stage: "storyboard", at: "2026-07-17T04:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-19T01:30:00.000Z", note: "Mencocokkan aset dari Asset Library" },
      ],
    },
    {
      id: "run-004",
      contentBriefId: "brief-004",
      currentStage: "render",
      status: "in_progress",
      revisionCount: 0,
      directiveId: "directive-004",
      storyboardId: "storyboard-004",
      renderJobId: "render-004",
      contentStudioScore: null,
      contentStudioVerdict: null,
      brief: {
        id: "brief-004",
        kpiTaskId: "kpi-task-104",
        title: "Highlight Fasilitas Kos Baru - Cabang Sleman",
        description: "Video tur fasilitas 45 detik untuk Instagram Reels.",
        contentFocus: "leasehold_sales",
        targetPlatform: "instagram",
        branchId: "branch-sleman-01",
        divisionId: "division-markom",
        dueDate: "2026-07-23",
        auditInsight: null,
      },
      history: [
        { stage: "brief", at: "2026-07-16T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-16T02:00:00.000Z" },
        { stage: "storyboard", at: "2026-07-16T05:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-17T01:00:00.000Z" },
        { stage: "render", at: "2026-07-19T02:00:00.000Z", note: "Render sedang berjalan (720p, mp4)" },
      ],
    },
    {
      id: "run-005",
      contentBriefId: "brief-005",
      currentStage: "storyboard",
      status: "awaiting_revision",
      revisionCount: 1,
      directiveId: "directive-005",
      storyboardId: "storyboard-005",
      renderJobId: "render-005",
      contentStudioScore: 6.4,
      contentStudioVerdict: "needs_revision",
      brief: {
        id: "brief-005",
        kpiTaskId: "kpi-task-105",
        title: "Promo Occupancy Rendah - Cabang Bantul",
        description: "Konten ajakan booking cepat untuk unit kosong.",
        contentFocus: "occupancy",
        targetPlatform: "instagram",
        branchId: "branch-bantul-01",
        divisionId: "division-markom",
        dueDate: "2026-07-21",
        auditInsight: {
          narrative: "Occupancy cabang di bawah benchmark, butuh dorongan konten agresif.",
          scores: { hook: 6.8, value: 6.5, cta: 5.9, nicheFit: 7.0, engagementPotential: 6.2, platformOptimization: 7.1, overall: 6.6 },
          growthSignal: "below_benchmark",
          recommendations: ["Perjelas harga & promo di 3 detik pertama", "Gunakan CTA langsung ke WhatsApp"],
        },
      },
      history: [
        { stage: "brief", at: "2026-07-13T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-13T02:00:00.000Z" },
        { stage: "storyboard", at: "2026-07-13T05:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-14T01:00:00.000Z" },
        { stage: "render", at: "2026-07-14T03:00:00.000Z" },
        { stage: "studio_review", at: "2026-07-14T06:00:00.000Z" },
        { stage: "revision", at: "2026-07-14T09:00:00.000Z", note: "Content Studio minta revisi (skor 6.4) - kembali ke Storyboard" },
      ],
    },
    {
      id: "run-006",
      contentBriefId: "brief-006",
      currentStage: "studio_review",
      status: "in_progress",
      revisionCount: 0,
      directiveId: "directive-006",
      storyboardId: "storyboard-006",
      renderJobId: "render-006",
      contentStudioScore: null,
      contentStudioVerdict: null,
      brief: {
        id: "brief-006",
        kpiTaskId: "kpi-task-106",
        title: "Before/After Perawatan Wajah - Loonars Beauty",
        description: "Reels before/after klien dengan izin publikasi.",
        contentFocus: "beauty",
        targetPlatform: "tiktok",
        branchId: "branch-jogja-01",
        divisionId: "division-loonars-beauty",
        dueDate: "2026-07-22",
        auditInsight: null,
      },
      history: [
        { stage: "brief", at: "2026-07-15T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-15T02:00:00.000Z" },
        { stage: "storyboard", at: "2026-07-15T05:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-16T01:00:00.000Z" },
        { stage: "render", at: "2026-07-17T02:00:00.000Z" },
        { stage: "studio_review", at: "2026-07-19T03:00:00.000Z", note: "Menunggu skor Content Studio" },
      ],
    },
    {
      id: "run-007",
      contentBriefId: "brief-007",
      currentStage: "render",
      status: "failed",
      revisionCount: 0,
      directiveId: "directive-007",
      storyboardId: "storyboard-007",
      renderJobId: "render-007",
      contentStudioScore: null,
      contentStudioVerdict: null,
      brief: {
        id: "brief-007",
        kpiTaskId: "kpi-task-107",
        title: "Grand Opening Cabang Godean",
        description: "Video pengumuman grand opening cabang baru.",
        contentFocus: "leasehold_sales",
        targetPlatform: "instagram",
        branchId: "branch-godean-01",
        divisionId: "division-markom",
        dueDate: "2026-07-20",
        auditInsight: null,
      },
      history: [
        { stage: "brief", at: "2026-07-12T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-12T02:00:00.000Z" },
        { stage: "storyboard", at: "2026-07-12T05:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-13T01:00:00.000Z" },
        { stage: "render", at: "2026-07-13T03:00:00.000Z", note: "Render gagal: aset video sumber corrupt (codec error)" },
      ],
    },
    {
      id: "run-008",
      contentBriefId: "brief-008",
      currentStage: "published",
      status: "approved",
      revisionCount: 0,
      directiveId: "directive-008",
      storyboardId: "storyboard-008",
      renderJobId: "render-008",
      contentStudioScore: 8.9,
      contentStudioVerdict: "approved",
      brief: {
        id: "brief-008",
        kpiTaskId: "kpi-task-108",
        title: "Edukasi Skincare Routine Malam - Loonars Beauty",
        description: "Reels edukasi 40 detik untuk Instagram.",
        contentFocus: "beauty",
        targetPlatform: "instagram",
        branchId: "branch-jogja-01",
        divisionId: "division-loonars-beauty",
        dueDate: "2026-07-19",
        auditInsight: {
          narrative: "Format edukasi malam hari punya engagement tinggi.",
          scores: { hook: 8.5, value: 8.8, cta: 7.9, nicheFit: 9.0, engagementPotential: 8.6, platformOptimization: 8.4, overall: 8.5 },
          growthSignal: "excellent",
          recommendations: ["Lanjutkan seri edukasi rutin"],
        },
      },
      history: [
        { stage: "brief", at: "2026-07-10T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-10T02:00:00.000Z" },
        { stage: "storyboard", at: "2026-07-10T05:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-11T01:00:00.000Z" },
        { stage: "render", at: "2026-07-11T03:00:00.000Z" },
        { stage: "studio_review", at: "2026-07-11T06:00:00.000Z" },
        { stage: "published", at: "2026-07-11T09:00:00.000Z", note: "Content Studio approve (skor 8.9)" },
      ],
    },
    {
      id: "run-009",
      contentBriefId: "brief-009",
      currentStage: "directive",
      status: "in_progress",
      revisionCount: 0,
      directiveId: null,
      storyboardId: null,
      renderJobId: null,
      contentStudioScore: null,
      contentStudioVerdict: null,
      brief: {
        id: "brief-009",
        kpiTaskId: "kpi-task-109",
        title: "Promo Akhir Pekan Sewa Harian",
        description: "Konten promo sewa harian untuk weekend getaway.",
        contentFocus: "leasehold_sales",
        targetPlatform: "tiktok",
        branchId: "branch-jogja-02",
        divisionId: "division-markom",
        dueDate: "2026-07-26",
        auditInsight: null,
      },
      history: [
        { stage: "brief", at: "2026-07-20T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-20T03:00:00.000Z", note: "AI Director menyusun narrative angle" },
      ],
    },
    {
      id: "run-010",
      contentBriefId: "brief-010",
      currentStage: "asset_selection",
      status: "awaiting_revision",
      revisionCount: 2,
      directiveId: "directive-010",
      storyboardId: "storyboard-010",
      renderJobId: "render-010",
      contentStudioScore: 5.8,
      contentStudioVerdict: "needs_revision",
      brief: {
        id: "brief-010",
        kpiTaskId: "kpi-task-110",
        title: "Kampanye Occupancy Cabang Kaliurang",
        description: "Konten kampanye multi-part untuk occupancy rendah.",
        contentFocus: "occupancy",
        targetPlatform: "instagram",
        branchId: "branch-kaliurang-01",
        divisionId: "division-markom",
        dueDate: "2026-07-23",
        auditInsight: {
          narrative: "Sudah 2x revisi, kualitas hook masih di bawah target.",
          scores: { hook: 5.5, value: 6.0, cta: 5.7, nicheFit: 6.5, engagementPotential: 5.9, platformOptimization: 6.4, overall: 6.0 },
          growthSignal: "below_benchmark",
          recommendations: ["Ganti opening shot", "Perkuat social proof di scene kedua"],
        },
      },
      history: [
        { stage: "brief", at: "2026-07-08T01:00:00.000Z" },
        { stage: "directive", at: "2026-07-08T02:00:00.000Z" },
        { stage: "storyboard", at: "2026-07-08T05:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-09T01:00:00.000Z" },
        { stage: "render", at: "2026-07-09T03:00:00.000Z" },
        { stage: "studio_review", at: "2026-07-09T06:00:00.000Z" },
        { stage: "revision", at: "2026-07-09T09:00:00.000Z", note: "Revisi pertama (skor 6.2) - kembali ke Storyboard" },
        { stage: "storyboard", at: "2026-07-10T01:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-10T02:00:00.000Z" },
        { stage: "render", at: "2026-07-11T01:00:00.000Z" },
        { stage: "studio_review", at: "2026-07-11T04:00:00.000Z" },
        { stage: "revision", at: "2026-07-11T07:00:00.000Z", note: "Revisi kedua (skor 5.8) - kembali ke Storyboard" },
        { stage: "storyboard", at: "2026-07-12T01:00:00.000Z" },
        { stage: "asset_selection", at: "2026-07-19T02:00:00.000Z", note: "Menyusun ulang pemilihan aset" },
      ],
    },
  ];
}

/** Sorted newest-activity-first for the board (latest history entry desc). */
function latestActivityAt(run: PipelineRunView): number {
  const last = run.history[run.history.length - 1];
  return last ? new Date(last.at).getTime() : 0;
}

export async function listPipelineRunsAction(): Promise<PipelineRunView[]> {
  await requirePermission("content_planner.view");
  return [...runs].sort((a, b) => latestActivityAt(b) - latestActivityAt(a));
}

export async function advanceRunAction(runId: string): Promise<ActionResult<PipelineRunView>> {
  await requirePermission("content_planner.view");

  const run = runs.find((r) => r.id === runId);
  if (!run) return actionError("Pipeline run tidak ditemukan");

  if (run.status === "approved") return actionError("Run sudah published, tidak ada tahap lanjutan");
  if (run.status === "failed") return actionError("Run berstatus gagal -- tidak bisa dilanjutkan otomatis");

  const next = NEXT_STAGE[run.currentStage];
  if (!next) {
    return actionError(
      `Tahap "${STAGE_LABELS[run.currentStage]}" membutuhkan aksi lain (mis. Simulasi Studio Review) untuk lanjut, bukan Advance Stage`,
    );
  }

  run.currentStage = next;
  if (run.status === "awaiting_revision") run.status = "in_progress";
  run.history = [...run.history, { stage: next, at: new Date().toISOString(), note: `Maju ke tahap ${STAGE_LABELS[next]}` }];

  revalidatePath("/kontenai/production-pipeline");
  return actionSuccess(run);
}

export async function submitStudioVerdictAction(
  runId: string,
  score: number,
  verdict: StudioVerdict,
): Promise<ActionResult<PipelineRunView>> {
  await requirePermission("content_planner.view");

  if (Number.isNaN(score) || score < 0 || score > 10) {
    return actionError("Skor harus di antara 0 dan 10", { score: ["Skor harus di antara 0 dan 10"] });
  }

  const run = runs.find((r) => r.id === runId);
  if (!run) return actionError("Pipeline run tidak ditemukan");

  if (run.currentStage !== "studio_review") {
    return actionError(`Run belum berada di tahap Studio Review (saat ini: ${STAGE_LABELS[run.currentStage]})`);
  }

  const roundedScore = Math.round(score * 10) / 10;
  run.contentStudioScore = roundedScore;
  run.contentStudioVerdict = verdict;

  const now = new Date().toISOString();
  if (verdict === "approved") {
    run.status = "approved";
    run.currentStage = "published";
    run.history = [...run.history, { stage: "published", at: now, note: `Content Studio approve (skor ${roundedScore})` }];
  } else {
    run.status = "awaiting_revision";
    run.revisionCount += 1;
    run.currentStage = REVISION_TARGET_STAGE;
    run.history = [
      ...run.history,
      {
        stage: "revision",
        at: now,
        note: `Content Studio minta revisi (skor ${roundedScore}) - kembali ke ${STAGE_LABELS[REVISION_TARGET_STAGE]}`,
      },
    ];
  }

  revalidatePath("/kontenai/production-pipeline");
  return actionSuccess(run);
}
