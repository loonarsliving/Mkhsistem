"use server";

import { revalidatePath } from "next/cache";

import { matchAssetsToScenes } from "@/features/kontenai/asset-selector/lib/scene-asset-matching";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { isVeoConfigured } from "@/lib/ai/veo/client";
import { createClient } from "@/lib/supabase/server";
import { listAnalyzedAssetLibrary, listUnanalyzedAssetsByCompany, type KontenAiAnalyzedAsset } from "@/repositories/kontenai-assets.repository";
import { getKontenAiStoryboard, updateKontenAiStoryboardScenes, type KontenAiStoryboardScene } from "@/repositories/kontenai-storyboards.repository";
import { createKontenAiVideoGenerationJob } from "@/repositories/kontenai-video-generation.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiStoryboardRow } from "@/types/domain";

const ASSET_SELECTOR_PATH = "/kontenai/asset-selector";

/** Below this Jaccard-based relevance score (0-100), the "best" Asset Library match is too weak to trust as-is -- Veo generates a fresh clip instead, using that weak match's photo as its starting image. */
const LOW_CONFIDENCE_SCORE_THRESHOLD = 25;

function buildVeoPrompt(scene: Pick<KontenAiStoryboardScene, "visualDescription" | "cameraAngle" | "shotType" | "motion" | "onScreenText">): string {
  return [scene.visualDescription, `Camera: ${scene.cameraAngle}, ${scene.shotType} shot.`, `Motion: ${scene.motion}.`, scene.onScreenText ? `On-screen text: "${scene.onScreenText}".` : ""]
    .filter(Boolean)
    .join(" ");
}

export async function listAnalyzedAssetLibraryAction(): Promise<KontenAiAnalyzedAsset[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listAnalyzedAssetLibrary(supabase);
}

export interface RunAssetSelectionActionResult {
  storyboard: KontenAiStoryboardRow;
  /** Scenes whose best Asset Library match was too weak to trust -- queued for Veo image-to-video generation (scripts/veo-worker.ts) instead, using that weak match as the starting image. 0 if every scene got a confident match. */
  queuedVideoGenerationCount: number;
  /** Footage from this brief's brand folder that Gemini Vision analyzed during this run, making it available to the ranking. */
  footageAnalyzed: number;
  /** Footage that could not be read; recorded as failed and excluded from the pool. */
  footageFailed: number;
}

/**
 * Asset Selector's core action: for every scene in the storyboard, ranks
 * the whole analyzed Asset Library against that scene's content using
 * Gemini Vision metadata (Sprint 2), auto-picks the best match, keeps the
 * top 5 as alternatives, then persists the result onto the storyboard's
 * scenes -- mirrors the "never throw, always return a clear ActionResult"
 * contract used across KontenAI. Scenes whose best match scores below
 * LOW_CONFIDENCE_SCORE_THRESHOLD also get a Veo video-generation job queued
 * (their selectedAssetId stays as that weak match in the meantime, so
 * render CAN still proceed immediately if the caller doesn't want to wait
 * for Veo -- the worker overwrites it with a proper generated clip once
 * done) -- but only when Veo is actually configured (VEO_API_KEY set); if
 * it isn't, every scene just keeps its best available match as-is instead
 * of queuing jobs nothing will ever process, which would otherwise leave a
 * storyboard stuck forever waiting on a render that never gets queued (see
 * scripts/veo-worker.ts's auto-queue-on-completion logic).
 */
/**
 * How many of the brief's brand folder we are willing to analyze inside one
 * production run. Deliberately bounded: this happens inside a user-triggered
 * action, so it has to finish, and it is not trying to work through the whole
 * library -- anything left over gets picked up by the next video's run.
 */
const VISION_PER_RUN_LIMIT = 8;

/**
 * Analyze the footage this brief's brand might use, right here in the
 * production run.
 *
 * This is where Vision belongs. Google Drive is storage; the per-brand
 * folders exist so a brief can be matched against its own brand's footage.
 * Without this step Asset Selector ranks against listAnalyzedAssetLibrary,
 * which only returns ai_vision_status='completed' -- so freshly-synced Drive
 * footage was invisible to it, every scene fell through to Veo generation,
 * and the published result never used the real footage at all -- the Drive
 * library sat untouched while Veo invented substitutes for it.
 *
 * Never throws: a clip that cannot be read is recorded as failed by
 * runVisionAnalysisAndSave and simply does not join the pool. Producing a
 * video with the footage that did analyze beats failing the whole run.
 */
async function analyzeBrandFootageForRun(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contentFocus: string | null,
): Promise<{ analyzed: number; failed: number }> {
  if (!contentFocus) return { analyzed: 0, failed: 0 };

  const pending = await listUnanalyzedAssetsByCompany(supabase, contentFocus, VISION_PER_RUN_LIMIT);
  if (pending.length === 0) return { analyzed: 0, failed: 0 };

  const { runVisionAnalysisAndSave } = await import("@/features/kontenai/asset-library/actions/gemini-vision.actions");

  let analyzed = 0;
  let failed = 0;
  for (const asset of pending) {
    // Sequential, not Promise.all: these are Gemini vision calls sharing one
    // circuit breaker with every other AI feature in the system.
    const outcome = await runVisionAnalysisAndSave(supabase, asset);
    if (outcome.success) analyzed += 1;
    else failed += 1;
  }
  return { analyzed, failed };
}

export async function runAssetSelectionAction(storyboardId: string): Promise<ActionResult<RunAssetSelectionActionResult>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const storyboard = await getKontenAiStoryboard(supabase, storyboardId);
    if (storyboard.scenes.length === 0) return actionError("Storyboard ini belum memiliki scene");

    // Analyze this brief's own brand footage first -- that is what makes the
    // Drive library usable by the ranking below.
    const visionOutcome = await analyzeBrandFootageForRun(supabase, storyboard.creativeBrief?.content_focus ?? null);

    const assetPool = await listAnalyzedAssetLibrary(supabase);
    const matches = matchAssetsToScenes(storyboard.scenes, assetPool);

    const scenes = storyboard.scenes.map((scene, index) => ({
      ...scene,
      selectedAssetId: matches[index].selectedAssetId,
      assetMatches: matches[index].assetMatches,
    }));

    const updated = await updateKontenAiStoryboardScenes(supabase, storyboardId, scenes, session.userId);

    let queuedVideoGenerationCount = 0;
    if (isVeoConfigured()) {
      for (let index = 0; index < scenes.length; index += 1) {
        const topScore = matches[index].assetMatches[0]?.score ?? 0;
        const baseAssetId = matches[index].selectedAssetId;
        if (topScore >= LOW_CONFIDENCE_SCORE_THRESHOLD || !baseAssetId) continue;

        await createKontenAiVideoGenerationJob(supabase, {
          storyboardId,
          sceneId: scenes[index].id,
          prompt: buildVeoPrompt(scenes[index]),
          baseAssetId,
          createdBy: session.userId,
        });
        queuedVideoGenerationCount += 1;
      }
    }

    revalidatePath(ASSET_SELECTOR_PATH);
    return actionSuccess({
      storyboard: updated,
      queuedVideoGenerationCount,
      footageAnalyzed: visionOutcome.analyzed,
      footageFailed: visionOutcome.failed,
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menjalankan Asset Selector");
  }
}

/** "User dapat mengganti asset secara manual" -- overrides one scene's selected asset without touching the others or re-running the match. */
export async function overrideSceneAssetAction(storyboardId: string, sceneId: string, assetId: string): Promise<ActionResult<KontenAiStoryboardRow>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const storyboard = await getKontenAiStoryboard(supabase, storyboardId);
    const targetScene = storyboard.scenes.find((scene) => scene.id === sceneId);
    if (!targetScene) return actionError("Scene tidak ditemukan pada storyboard ini");

    const scenes = storyboard.scenes.map((scene) => (scene.id === sceneId ? { ...scene, selectedAssetId: assetId } : scene));
    const updated = await updateKontenAiStoryboardScenes(supabase, storyboardId, scenes, session.userId);

    revalidatePath(ASSET_SELECTOR_PATH);
    return actionSuccess(updated);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal mengganti aset");
  }
}
