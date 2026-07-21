"use server";

/**
 * Sprint 6 - Render Engine mock actions.
 *
 * There is no ffmpeg (or any real video encoder) available in this
 * environment, and real rendering is explicitly out of scope for this
 * build phase. These actions simulate a render queue/job lifecycle
 * in-memory only -- nothing here touches Supabase or a filesystem.
 *
 * The in-memory `jobs` array is module-level state, which is fine for
 * this mock/placeholder phase: it survives across action calls within
 * the same server process so the queue looks consistent as jobs are
 * submitted, but it is not real persistence and resets on redeploy.
 */

import { hasPermission, requireSession } from "@/lib/rbac/session";
import type { RenderJob } from "@/features/kontenai/types";
import type { StoryboardSummary } from "@/features/kontenai/render-engine/types";

async function assertCanView() {
  const session = await requireSession();
  if (!hasPermission(session, "content_planner.view")) {
    throw new Error("Not authorized to view the Render Engine.");
  }
}

const READY_STORYBOARDS: StoryboardSummary[] = [
  {
    id: "storyboard-1001",
    directiveId: "directive-2001",
    title: "Promo Unit 2BR - Golden Week",
    targetPlatform: "instagram",
    sceneCount: 6,
    totalDurationSeconds: 32,
    assetsFullySelected: true,
  },
  {
    id: "storyboard-1002",
    directiveId: "directive-2002",
    title: "Testimoni Penghuni - Blok C",
    targetPlatform: "tiktok",
    sceneCount: 4,
    totalDurationSeconds: 21,
    assetsFullySelected: true,
  },
  {
    id: "storyboard-1003",
    directiveId: "directive-2003",
    title: "Behind the Scenes: Renovasi Lobby",
    targetPlatform: "instagram",
    sceneCount: 8,
    totalDurationSeconds: 45,
    assetsFullySelected: true,
  },
  {
    id: "storyboard-1004",
    directiveId: "directive-2004",
    title: "Beauty Studio - Before/After Facial",
    targetPlatform: "tiktok",
    sceneCount: 5,
    totalDurationSeconds: 27,
    assetsFullySelected: true,
  },
  {
    id: "storyboard-1005",
    directiveId: "directive-2005",
    title: "Highlight Event Gathering Sales Q3",
    targetPlatform: "instagram",
    sceneCount: 7,
    totalDurationSeconds: 38,
    assetsFullySelected: true,
  },
];

let jobs: RenderJob[] = [
  {
    id: "render-0001",
    storyboardId: "storyboard-0091",
    status: "completed",
    progress: 100,
    outputUrl: "https://cdn.mock.kontenai.local/renders/render-0001.mp4",
    renderSettings: { resolution: "1080x1920", format: "mp4", fps: 30 },
    startedAt: "2026-07-20T02:14:00.000Z",
    completedAt: "2026-07-20T02:16:40.000Z",
    errorMessage: null,
  },
  {
    id: "render-0002",
    storyboardId: "storyboard-0092",
    status: "rendering",
    progress: 42,
    outputUrl: null,
    renderSettings: { resolution: "1080x1350", format: "mp4", fps: 30 },
    startedAt: "2026-07-21T03:40:00.000Z",
    completedAt: null,
    errorMessage: null,
  },
  {
    id: "render-0003",
    storyboardId: "storyboard-0093",
    status: "queued",
    progress: 0,
    outputUrl: null,
    renderSettings: { resolution: "1080x1920", format: "mp4", fps: 24 },
    startedAt: null,
    completedAt: null,
    errorMessage: null,
  },
  {
    id: "render-0004",
    storyboardId: "storyboard-0094",
    status: "failed",
    progress: 58,
    outputUrl: null,
    renderSettings: { resolution: "1920x1080", format: "mov", fps: 30 },
    startedAt: "2026-07-19T09:05:00.000Z",
    completedAt: "2026-07-19T09:07:12.000Z",
    errorMessage: "Scene 4 is missing a selected asset -- render aborted.",
  },
  {
    id: "render-0005",
    storyboardId: "storyboard-0095",
    status: "completed",
    progress: 100,
    outputUrl: "https://cdn.mock.kontenai.local/renders/render-0005.mp4",
    renderSettings: { resolution: "1080x1920", format: "mp4", fps: 30 },
    startedAt: "2026-07-18T06:00:00.000Z",
    completedAt: "2026-07-18T06:02:05.000Z",
    errorMessage: null,
  },
];

export async function listStoryboardsReadyToRenderAction(): Promise<StoryboardSummary[]> {
  await assertCanView();
  return READY_STORYBOARDS;
}

export async function listRenderJobsAction(): Promise<RenderJob[]> {
  await assertCanView();
  return jobs;
}

export async function submitRenderJobAction(storyboardId: string): Promise<RenderJob> {
  await assertCanView();

  const newJob: RenderJob = {
    id: `render-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    storyboardId,
    status: "queued",
    progress: 0,
    outputUrl: null,
    renderSettings: { resolution: "1080x1920", format: "mp4", fps: 30 },
    startedAt: null,
    completedAt: null,
    errorMessage: null,
  };

  jobs = [newJob, ...jobs];
  return newJob;
}
