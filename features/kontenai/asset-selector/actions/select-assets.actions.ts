"use server";

import { revalidatePath } from "next/cache";

import { matchAssetsToScenes } from "@/features/kontenai/asset-selector/lib/scene-asset-matching";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { createClient } from "@/lib/supabase/server";
import { listAnalyzedAssetLibrary, type KontenAiAnalyzedAsset } from "@/repositories/kontenai-assets.repository";
import { getKontenAiStoryboard, updateKontenAiStoryboardScenes } from "@/repositories/kontenai-storyboards.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiStoryboardRow } from "@/types/domain";

const ASSET_SELECTOR_PATH = "/kontenai/asset-selector";

export async function listAnalyzedAssetLibraryAction(): Promise<KontenAiAnalyzedAsset[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listAnalyzedAssetLibrary(supabase);
}

/**
 * Asset Selector's core action: for every scene in the storyboard, ranks
 * the whole analyzed Asset Library against that scene's content using
 * Gemini Vision metadata (Sprint 2), auto-picks the best match, keeps the
 * top 5 as alternatives, then persists the result onto the storyboard's
 * scenes -- mirrors the "never throw, always return a clear ActionResult"
 * contract used across KontenAI.
 */
export async function runAssetSelectionAction(storyboardId: string): Promise<ActionResult<KontenAiStoryboardRow>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const storyboard = await getKontenAiStoryboard(supabase, storyboardId);
    if (storyboard.scenes.length === 0) return actionError("Storyboard ini belum memiliki scene");

    const assetPool = await listAnalyzedAssetLibrary(supabase);
    const matches = matchAssetsToScenes(storyboard.scenes, assetPool);

    const scenes = storyboard.scenes.map((scene, index) => ({
      ...scene,
      selectedAssetId: matches[index].selectedAssetId,
      assetMatches: matches[index].assetMatches,
    }));

    const updated = await updateKontenAiStoryboardScenes(supabase, storyboardId, scenes, session.userId);

    revalidatePath(ASSET_SELECTOR_PATH);
    return actionSuccess(updated);
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
