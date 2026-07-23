"use server";

import { revalidatePath } from "next/cache";

import { isVisionEligibleAssetType } from "@/features/kontenai/asset-library/utils/vision-eligibility";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { analyzeAssetWithGeminiVision, analyzeVideoKeyframe, analyzeVideoWithoutFrames, combineVideoSceneAnalysis } from "@/lib/ai/domains/kontenai-vision";
import { resolveAssetDownloadSource } from "@/lib/kontenai/asset-source";
import { createClient } from "@/lib/supabase/server";
import { fetchUrlAsBase64 } from "@/lib/utils/fetch-remote-file";
import { extractVideoKeyframes } from "@/lib/video/extract-keyframes";
import {
  getKontenAiAsset,
  markKontenAiAssetVisionPending,
  saveKontenAiAssetVisionFailure,
  saveKontenAiAssetVisionResult,
  type KontenAiAssetType,
} from "@/repositories/kontenai-assets.repository";
import { actionSuccess, type ActionResult, type KontenAiAssetRow } from "@/types/domain";

const ASSET_LIBRARY_PATH = "/kontenai/asset-library";

async function analyzeImageAsset(asset: Pick<KontenAiAssetRow, "title" | "filename" | "public_url" | "storage_path" | "storage_provider">) {
  const source = await resolveAssetDownloadSource(asset);
  const imageBase64 = await fetchUrlAsBase64(source.url, source.headers);
  return analyzeAssetWithGeminiVision({
    filename: asset.filename,
    currentTitle: asset.title,
    assetType: "image",
    imageBase64,
    imageMimeType: "image/jpeg",
  });
}

/**
 * Real "Video Intelligence": extracts keyframes with ffmpeg, sends every
 * frame to Gemini Vision individually (one real vision call per frame),
 * then combines every frame's scene caption into one consolidated
 * video-level metadata result. Falls back to the filename/context-only
 * analysis (analyzeVideoWithoutFrames) only if extraction yields zero
 * usable frames -- never fails the whole analysis just because one frame
 * failed to decode.
 */
async function analyzeVideoAsset(asset: Pick<KontenAiAssetRow, "title" | "filename" | "public_url" | "duration_seconds" | "storage_path" | "storage_provider">) {
  const source = await resolveAssetDownloadSource(asset);
  const frames = await extractVideoKeyframes(source.url, asset.duration_seconds, { maxFrames: 8, minIntervalSeconds: 5, headers: source.headers });

  if (frames.length === 0) {
    const fallback = await analyzeVideoWithoutFrames(asset.filename, asset.title);
    return { result: fallback, sceneSummary: [] as { timestampSeconds: number; description: string }[] };
  }

  const sceneSummary = await Promise.all(
    frames.map(async (frame) => ({
      timestampSeconds: frame.timestampSeconds,
      description: await analyzeVideoKeyframe({
        base64: frame.base64,
        mimeType: frame.mimeType,
        timestampSeconds: frame.timestampSeconds,
        filename: asset.filename,
      }),
    })),
  );

  const result = await combineVideoSceneAnalysis({
    filename: asset.filename,
    currentTitle: asset.title,
    durationSeconds: asset.duration_seconds,
    scenes: sceneSummary,
  });

  return { result, sceneSummary };
}

/**
 * Runs Gemini Vision on one asset and persists the result -- shared by the
 * "analyze right after upload" path (createKontenAiAssetAction) and the
 * "Analyze Again" button (analyzeAssetVisionAction). Mirrors
 * runReviewAndSave in features/markom/actions/content-submission.actions.ts:
 * never throws, always leaves the row in a clear terminal ai_vision_status
 * ('completed' or 'failed') so the UI can show what happened and the user
 * can retry on failure.
 */
export async function runVisionAnalysisAndSave(
  supabase: Awaited<ReturnType<typeof createClient>>,
  asset: Pick<KontenAiAssetRow, "id" | "title" | "filename" | "asset_type" | "public_url" | "duration_seconds" | "storage_path" | "storage_provider">,
): Promise<{ success: boolean; error?: string }> {
  if (!isVisionEligibleAssetType(asset.asset_type as KontenAiAssetType)) {
    return { success: false, error: "Tipe aset ini tidak didukung Gemini Vision" };
  }

  try {
    await markKontenAiAssetVisionPending(supabase, asset.id);

    if (asset.asset_type === "image") {
      const result = await analyzeImageAsset(asset);
      await saveKontenAiAssetVisionResult(supabase, asset.id, result);
    } else {
      const { result, sceneSummary } = await analyzeVideoAsset(asset);
      await saveKontenAiAssetVisionResult(supabase, asset.id, { ...result, sceneSummary });
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menganalisis aset dengan Gemini Vision";
    await saveKontenAiAssetVisionFailure(supabase, asset.id, message);
    return { success: false, error: message };
  }
}

/** "Analyze Again" -- re-runs Gemini Vision (image: real vision; video: re-extracts keyframes and re-runs Video Intelligence) on an already-uploaded asset, whatever its current ai_vision_status is. */
export async function analyzeAssetVisionAction(assetId: string): Promise<ActionResult<{ analyzed: boolean; error?: string }>> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  const asset = await getKontenAiAsset(supabase, assetId);
  const outcome = await runVisionAnalysisAndSave(supabase, asset);

  revalidatePath(ASSET_LIBRARY_PATH);
  return actionSuccess({ analyzed: outcome.success, error: outcome.error });
}
