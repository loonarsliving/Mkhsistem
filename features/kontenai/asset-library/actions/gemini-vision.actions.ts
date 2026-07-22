"use server";

import { revalidatePath } from "next/cache";

import { isVisionEligibleAssetType } from "@/features/kontenai/asset-library/utils/vision-eligibility";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { analyzeAssetWithGeminiVision } from "@/lib/ai/domains/kontenai-vision";
import { createClient } from "@/lib/supabase/server";
import { fetchUrlAsBase64 } from "@/lib/utils/fetch-remote-file";
import {
  getKontenAiAsset,
  markKontenAiAssetVisionPending,
  saveKontenAiAssetVisionFailure,
  saveKontenAiAssetVisionResult,
  type KontenAiAssetType,
} from "@/repositories/kontenai-assets.repository";
import { actionSuccess, type ActionResult, type KontenAiAssetRow } from "@/types/domain";

const ASSET_LIBRARY_PATH = "/kontenai/asset-library";

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
  asset: Pick<KontenAiAssetRow, "id" | "title" | "filename" | "asset_type" | "public_url">,
): Promise<{ success: boolean; error?: string }> {
  if (!isVisionEligibleAssetType(asset.asset_type as KontenAiAssetType)) {
    return { success: false, error: "Tipe aset ini tidak didukung Gemini Vision" };
  }

  try {
    await markKontenAiAssetVisionPending(supabase, asset.id);

    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    if (asset.asset_type === "image") {
      imageBase64 = await fetchUrlAsBase64(asset.public_url);
      imageMimeType = "image/jpeg";
    }

    const result = await analyzeAssetWithGeminiVision({
      filename: asset.filename,
      currentTitle: asset.title,
      assetType: asset.asset_type as "image" | "video",
      imageBase64,
      imageMimeType,
    });

    await saveKontenAiAssetVisionResult(supabase, asset.id, result);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menganalisis aset dengan Gemini Vision";
    await saveKontenAiAssetVisionFailure(supabase, asset.id, message);
    return { success: false, error: message };
  }
}

/** "Analyze Again" -- re-runs Gemini Vision on an already-uploaded asset, whatever its current ai_vision_status is. */
export async function analyzeAssetVisionAction(assetId: string): Promise<ActionResult<{ analyzed: boolean; error?: string }>> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  const asset = await getKontenAiAsset(supabase, assetId);
  const outcome = await runVisionAnalysisAndSave(supabase, asset);

  revalidatePath(ASSET_LIBRARY_PATH);
  return actionSuccess({ analyzed: outcome.success, error: outcome.error });
}
