"use server";

import { revalidatePath } from "next/cache";

import type { ContentBrief, PipelineRun, PipelineStage, StudioVerdict } from "@/features/kontenai/types";
import { requirePermission } from "@/lib/rbac/session";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { generateDirectiveAction } from "@/features/kontenai/ai-director/actions/ai-director.actions";
import { generateStoryboardAction } from "@/features/kontenai/storyboard-engine/actions/storyboard-engine.actions";
import { selectAssetsForStoryboardAction } from "@/features/kontenai/asset-selector/actions/asset-selector.actions";
import { submitRenderJobAction } from "@/features/kontenai/render-engine/actions/render-engine.actions";
import { recordLearningOutcomeAction } from "@/features/kontenai/learning-engine/actions/learning-engine.actions";

import { generateId } from "@/features/kontenai/lib/ids";
import { findContentBriefById, findPipelineRunById, findRenderJobById, getMockDb } from "@/features/kontenai/lib/mock-db";
import { deriveStudioVerdict } from "@/features/kontenai/lib/scoring";

import { STAGE_LABELS, type PipelineRunView } from "../types";

/**
 * Sprint 7 - Production Pipeline, real orchestration.
 *
 * This is the one KontenAI module that actually drives the other sprints'
 * mocked server actions end-to-end (Content Planner brief -> AI Director
 * -> Storyboard Engine -> Asset Selector -> Render Engine -> Content
 * Studio review -> Learning Engine), instead of re-mocking their outputs
 * locally. State lives in the shared in-memory store
 * (`features/kontenai/lib/mock-db.ts`, `getMockDb().pipelineRuns`), so a
 * run created here is visible to any other module that reads
 * `findPipelineRunById`.
 *
 * There is still no real Content Studio integration and no real
 * persistence (Supabase) -- Content Studio review is simulated by the
 * user entering a score in the UI, per the explicit project-owner
 * decision for this build phase.
 */

/** Where a run goes when Content Studio asks for a revision. "directive"
 * is the most upstream stage still meaningfully re-runnable in this mock:
 * we call AI Director again for a fresh pass right away (see
 * `submitStudioVerdictAction`) and park the run at "directive" so the next
 * `advanceRunAction` call regenerates the storyboard from that fresh
 * directive onward -- a real revision loop, not just a status flag. */
const REVISION_TARGET_STAGE: PipelineStage = "directive";

function now(): string {
  return new Date().toISOString();
}

function toView(run: PipelineRun, brief: ContentBrief): PipelineRunView {
  return { ...run, brief };
}

/** Sorted newest-activity-first for the board (latest history entry desc). */
function latestActivityAt(run: PipelineRunView): number {
  const last = run.history[run.history.length - 1];
  return last ? new Date(last.at).getTime() : 0;
}

export async function listPipelineRunsAction(): Promise<PipelineRunView[]> {
  await requirePermission("content_planner.view");

  const views = getMockDb()
    .pipelineRuns.map((run) => {
      const brief = findContentBriefById(run.contentBriefId);
      return brief ? toView(run, brief) : null;
    })
    .filter((view): view is PipelineRunView => view !== null);

  return views.sort((a, b) => latestActivityAt(b) - latestActivityAt(a));
}

/** Small helper for the "Start New Run" UI so it can let the user pick a
 * real Content Planner brief to kick a run off from. */
export async function listAvailableContentBriefsAction(): Promise<ContentBrief[]> {
  await requirePermission("content_planner.view");
  return getMockDb().contentBriefs;
}

export async function startPipelineRunAction(contentBriefId: string): Promise<ActionResult<PipelineRunView>> {
  await requirePermission("content_planner.view");

  const brief = findContentBriefById(contentBriefId);
  if (!brief) return actionError("Content brief tidak ditemukan");

  const run: PipelineRun = {
    id: generateId("run"),
    contentBriefId,
    currentStage: "brief",
    status: "in_progress",
    revisionCount: 0,
    directiveId: null,
    storyboardId: null,
    renderJobId: null,
    contentStudioScore: null,
    contentStudioVerdict: null,
    history: [{ stage: "brief", at: now(), note: `Brief diterima dari Content Planner: "${brief.title}"` }],
  };

  getMockDb().pipelineRuns.push(run);

  revalidatePath("/kontenai/production-pipeline");
  return actionSuccess(toView(run, brief));
}

/**
 * Drives the run one real step forward by calling the matching sprint's
 * server action for `currentStage`, then advances `currentStage` and
 * appends a history entry describing what actually happened.
 */
export async function advanceRunAction(runId: string): Promise<ActionResult<PipelineRunView>> {
  await requirePermission("content_planner.view");

  const run = findPipelineRunById(runId);
  if (!run) return actionError("Pipeline run tidak ditemukan");

  if (run.status === "approved") return actionError("Run sudah published, tidak ada tahap lanjutan");
  if (run.status === "failed") return actionError("Run berstatus gagal -- tidak bisa dilanjutkan otomatis");

  const brief = findContentBriefById(run.contentBriefId);
  if (!brief) return actionError("Content brief untuk run ini tidak ditemukan");

  try {
    switch (run.currentStage) {
      case "brief": {
        const directive = await generateDirectiveAction(run.contentBriefId);
        run.directiveId = directive.id;
        run.currentStage = "directive";
        run.history = [
          ...run.history,
          { stage: "directive", at: now(), note: `AI Director menyusun directive: ${directive.narrativeAngle.slice(0, 90)}` },
        ];
        break;
      }

      case "directive": {
        if (!run.directiveId) return actionError("Run belum memiliki directive untuk disusun storyboard-nya");
        const storyboard = await generateStoryboardAction(run.directiveId);
        run.storyboardId = storyboard.id;
        run.currentStage = "storyboard";
        run.history = [
          ...run.history,
          {
            stage: "storyboard",
            at: now(),
            note: `Storyboard Engine menyusun ${storyboard.scenes.length} scene (${storyboard.totalDurationSeconds}s total)`,
          },
        ];
        break;
      }

      case "storyboard": {
        if (!run.storyboardId) return actionError("Run belum memiliki storyboard untuk pemilihan aset");
        const selections = await selectAssetsForStoryboardAction(run.storyboardId);
        run.currentStage = "asset_selection";
        run.history = [
          ...run.history,
          {
            stage: "asset_selection",
            at: now(),
            note: `Asset Selector memilih ${selections.length} aset untuk setiap scene storyboard`,
          },
        ];
        break;
      }

      case "asset_selection": {
        if (!run.storyboardId) return actionError("Run belum memiliki storyboard untuk di-render");
        const job = await submitRenderJobAction(run.storyboardId);
        run.renderJobId = job.id;
        run.currentStage = "render";
        run.history = [
          ...run.history,
          {
            stage: "render",
            at: now(),
            note: `Render job diajukan ke Render Engine (${job.renderSettings.resolution}, ${job.renderSettings.format})`,
          },
        ];
        break;
      }

      case "render": {
        if (!run.renderJobId) return actionError("Run belum memiliki render job");
        const job = findRenderJobById(run.renderJobId);
        if (!job) return actionError("Render job tidak ditemukan di Render Engine");

        if (job.status === "completed") {
          run.currentStage = "studio_review";
          run.history = [
            ...run.history,
            { stage: "studio_review", at: now(), note: "Render selesai -- dikirim ke Content Studio untuk direview" },
          ];
        } else if (job.status === "failed") {
          run.status = "failed";
          run.history = [
            ...run.history,
            { stage: "render", at: now(), note: `Render gagal: ${job.errorMessage ?? "kesalahan tidak diketahui"}` },
          ];
          revalidatePath("/kontenai/production-pipeline");
          return actionSuccess(toView(run, brief));
        } else {
          // queued or rendering -- nothing to advance yet. Return the
          // current (unchanged) state as a success, but surface a clear
          // message so the UI can tell the user why nothing moved.
          return {
            ...actionSuccess(toView(run, brief)),
            error: `Render belum selesai (status: ${job.status}, progress ${job.progress}%)`,
          };
        }
        break;
      }

      default:
        return actionError(
          `Tahap "${STAGE_LABELS[run.currentStage]}" membutuhkan aksi lain (mis. Simulasi Studio Review) untuk lanjut, bukan Advance Stage`,
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan tak terduga saat memproses tahap ini";
    run.status = "failed";
    run.history = [...run.history, { stage: run.currentStage, at: now(), note: `Gagal: ${message}` }];
    revalidatePath("/kontenai/production-pipeline");
    return actionError(message);
  }

  revalidatePath("/kontenai/production-pipeline");
  return actionSuccess(toView(run, brief));
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

  const run = findPipelineRunById(runId);
  if (!run) return actionError("Pipeline run tidak ditemukan");

  const brief = findContentBriefById(run.contentBriefId);
  if (!brief) return actionError("Content brief untuk run ini tidak ditemukan");

  if (run.currentStage !== "studio_review") {
    return actionError(`Run belum berada di tahap Studio Review (saat ini: ${STAGE_LABELS[run.currentStage]})`);
  }

  const roundedScore = Math.round(score * 10) / 10;

  // Single source of truth for the auto-approve threshold, mirroring what
  // the real Content Studio will enforce -- don't trust the caller-passed
  // verdict blindly, always resolve it the same way the rest of the
  // pipeline does.
  const resolvedVerdict = deriveStudioVerdict(roundedScore);
  if (resolvedVerdict !== verdict) {
    console.warn(
      `submitStudioVerdictAction: verdict parameter (${verdict}) tidak sesuai ambang deriveStudioVerdict (${resolvedVerdict}) untuk skor ${roundedScore}; menggunakan hasil deriveStudioVerdict.`,
    );
  }

  run.contentStudioScore = roundedScore;
  run.contentStudioVerdict = resolvedVerdict;

  try {
    if (resolvedVerdict === "approved") {
      run.status = "approved";
      run.currentStage = "published";
      run.history = [
        ...run.history,
        { stage: "published", at: now(), note: `Content Studio approve (skor ${roundedScore}) -- run dipublikasikan` },
      ];

      await recordLearningOutcomeAction({ pipelineRunId: run.id, finalScore: roundedScore, verdict: "approved" });
    } else {
      run.status = "awaiting_revision";
      run.revisionCount += 1;

      run.history = [
        ...run.history,
        {
          stage: "revision",
          at: now(),
          note: `Content Studio minta revisi (skor ${roundedScore}) -- AI Director menyusun ulang directive`,
        },
      ];

      // Real revision loop: re-run AI Director right away for a fresh
      // pass, then park the run at "directive" so the next advance call
      // regenerates the storyboard onward from this new directive.
      const freshDirective = await generateDirectiveAction(run.contentBriefId);
      run.directiveId = freshDirective.id;
      run.currentStage = REVISION_TARGET_STAGE;
      run.history = [
        ...run.history,
        {
          stage: "directive",
          at: now(),
          note: `Directive baru (revisi #${run.revisionCount}): ${freshDirective.narrativeAngle.slice(0, 90)}`,
        },
      ];

      await recordLearningOutcomeAction({ pipelineRunId: run.id, finalScore: roundedScore, verdict: "needs_revision" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan tak terduga saat memproses verdict Content Studio";
    run.status = "failed";
    run.history = [...run.history, { stage: run.currentStage, at: now(), note: `Gagal: ${message}` }];
    revalidatePath("/kontenai/production-pipeline");
    return actionError(message);
  }

  revalidatePath("/kontenai/production-pipeline");
  return actionSuccess(toView(run, brief));
}
