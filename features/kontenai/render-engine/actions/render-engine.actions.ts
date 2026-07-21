"use server";

/**
 * Sprint 6 - Render Engine actions.
 *
 * There is no ffmpeg (or any real video encoder) available in this
 * environment, and real rendering is explicitly out of scope for this
 * build phase. These actions simulate a render queue/job lifecycle
 * in-memory only -- nothing here touches Supabase or a filesystem.
 *
 * Unlike the original placeholder version of this file, this module now
 * reads/writes through the shared `getMockDb()` store
 * (features/kontenai/lib/mock-db.ts) instead of a disconnected local
 * seed list, so it operates on the real `Storyboard`s produced by
 * Storyboard Engine (Sprint 4) and enriched with `selectedAssetId`s by
 * Asset Selector (Sprint 5), and the `RenderJob`s it creates are visible
 * to Production Pipeline (Sprint 7) through the same store.
 */

import { hasPermission, requireSession } from "@/lib/rbac/session";
import { getMockDb } from "@/features/kontenai/lib/mock-db";
import { generateId } from "@/features/kontenai/lib/ids";
import type { RenderJob, Storyboard, TargetPlatform } from "@/features/kontenai/types";
import type { StoryboardSummary } from "@/features/kontenai/render-engine/types";

async function assertCanView() {
  const session = await requireSession();
  if (!hasPermission(session, "content_planner.view")) {
    throw new Error("Not authorized to view the Render Engine.");
  }
}

/**
 * A storyboard is "render-ready" when every one of its scenes has an
 * asset assigned. This is the single source of truth for readiness --
 * both the ready-to-render listing and the submit guard below use it,
 * so the UI can never queue a storyboard the store itself would reject.
 */
function isStoryboardRenderReady(storyboard: Storyboard): boolean {
  return storyboard.scenes.length > 0 && storyboard.scenes.every((scene) => scene.selectedAssetId !== null);
}

/** A storyboard shouldn't be offered again while it already has a job that hasn't failed. */
function hasNonFailedJob(storyboardId: string): boolean {
  return getMockDb().renderJobs.some((job) => job.storyboardId === storyboardId && job.status !== "failed");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}

/**
 * Storyboards don't carry a title or target platform directly (Sprint 4's
 * shape only has scenes + directiveId); both are derived from the
 * ProductionDirective that spawned the storyboard, when it's available in
 * the shared store. Falls back to a generic label so this module still
 * degrades gracefully if a storyboard's directive isn't in the store.
 */
function describeStoryboard(storyboard: Storyboard): { title: string; targetPlatform: TargetPlatform } {
  const directive = getMockDb().directives.find((d) => d.id === storyboard.directiveId);
  if (directive) {
    return { title: truncate(directive.narrativeAngle, 70), targetPlatform: directive.targetPlatform };
  }
  return { title: `Storyboard ${storyboard.id}`, targetPlatform: "instagram" };
}

/**
 * Render settings vary a little by real storyboard data instead of being
 * a flat constant, to show real parameterization:
 *  - resolution follows the destination platform (tall 9:16 for TikTok,
 *    a slightly shorter portrait crop for Instagram feed);
 *  - fps drops from 30 to 24 for longer storyboards (> 40s) as a stand-in
 *    for the real encoder trading smoothness for output size on longer
 *    clips.
 */
function pickRenderSettings(storyboard: Storyboard, targetPlatform: TargetPlatform): RenderJob["renderSettings"] {
  const resolution = targetPlatform === "tiktok" ? "1080x1920" : "1080x1350";
  const fps = storyboard.totalDurationSeconds > 40 ? 24 : 30;
  return { resolution, format: "mp4", fps };
}

export async function listStoryboardsReadyToRenderAction(): Promise<StoryboardSummary[]> {
  await assertCanView();

  return getMockDb()
    .storyboards.filter((storyboard) => isStoryboardRenderReady(storyboard) && !hasNonFailedJob(storyboard.id))
    .map((storyboard) => {
      const { title, targetPlatform } = describeStoryboard(storyboard);
      return {
        id: storyboard.id,
        directiveId: storyboard.directiveId,
        title,
        targetPlatform,
        sceneCount: storyboard.scenes.length,
        totalDurationSeconds: storyboard.totalDurationSeconds,
        assetsFullySelected: true,
      } satisfies StoryboardSummary;
    });
}

export async function listRenderJobsAction(): Promise<RenderJob[]> {
  await assertCanView();
  return getMockDb().renderJobs;
}

export async function submitRenderJobAction(storyboardId: string): Promise<RenderJob> {
  await assertCanView();

  const db = getMockDb();
  const storyboard = db.storyboards.find((sb) => sb.id === storyboardId);
  if (!storyboard) {
    throw new Error(`Storyboard ${storyboardId} tidak ditemukan.`);
  }
  if (!isStoryboardRenderReady(storyboard)) {
    throw new Error(`Storyboard ${storyboardId} belum siap dirender -- masih ada scene tanpa aset terpilih.`);
  }
  if (hasNonFailedJob(storyboardId)) {
    throw new Error(`Storyboard ${storyboardId} sudah memiliki render job yang aktif atau selesai.`);
  }

  const { targetPlatform } = describeStoryboard(storyboard);
  const newJob: RenderJob = {
    id: generateId("render"),
    storyboardId,
    status: "queued",
    progress: 0,
    outputUrl: null,
    renderSettings: pickRenderSettings(storyboard, targetPlatform),
    startedAt: null,
    completedAt: null,
    errorMessage: null,
  };

  db.renderJobs = [newJob, ...db.renderJobs];
  return newJob;
}

const FAILURE_MESSAGES = [
  "Encoder timeout while stitching scene transitions -- render aborted.",
  "Selected asset became unavailable mid-render -- render aborted.",
  "Output exceeded platform duration limit -- render aborted.",
  "Unexpected encoder crash on the final pass -- render aborted.",
];

/** ~8% of renders that reach 100% fail instead of completing, for realism. */
const FAILURE_RATE = 0.08;

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Advances a single render job one lifecycle step and persists the
 * mutation directly into the shared store (mutates the object in place
 * rather than replacing it, so any other holder of the same reference --
 * e.g. Production Pipeline -- sees the update too).
 *
 * Steps:
 *   queued    -> rendering (worker picks the job up, progress kicks off)
 *   rendering -> rendering (progress increases) or a terminal state:
 *                completed (with a mock outputUrl) most of the time, or
 *                failed (with a plausible errorMessage) ~8% of the time
 *   completed / failed -> no-op, returned as-is (idempotent on terminal jobs)
 */
export async function advanceRenderJobAction(renderJobId: string): Promise<RenderJob> {
  await assertCanView();

  const job = getMockDb().renderJobs.find((j) => j.id === renderJobId);
  if (!job) {
    throw new Error(`Render job ${renderJobId} tidak ditemukan.`);
  }

  if (job.status === "completed" || job.status === "failed") {
    return job;
  }

  if (job.status === "queued") {
    job.status = "rendering";
    job.startedAt = new Date().toISOString();
    job.progress = randomBetween(5, 15);
    return job;
  }

  // job.status === "rendering"
  const nextProgress = Math.min(100, job.progress + randomBetween(15, 34));

  if (nextProgress < 100) {
    job.progress = nextProgress;
    return job;
  }

  if (Math.random() < FAILURE_RATE) {
    job.status = "failed";
    job.progress = Math.min(99, nextProgress);
    job.completedAt = new Date().toISOString();
    job.errorMessage = FAILURE_MESSAGES[randomBetween(0, FAILURE_MESSAGES.length - 1)];
    return job;
  }

  job.status = "completed";
  job.progress = 100;
  job.completedAt = new Date().toISOString();
  job.outputUrl = `https://renders.mock.kontenai.local/${job.id}.mp4`;
  return job;
}
