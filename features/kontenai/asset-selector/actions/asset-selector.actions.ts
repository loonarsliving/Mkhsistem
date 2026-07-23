"use server";

import type { AssetRecord, AssetSelection, Storyboard, StoryboardScene } from "@/features/kontenai/types";
import { getMockDb } from "@/features/kontenai/lib/mock-db";
import { computeAssetRankingScore, computeTagMatchScore } from "@/features/kontenai/lib/scoring";

/**
 * Sprint 5 - Asset Selector. Reads storyboards and the asset library from
 * the shared mock-db (`features/kontenai/lib/mock-db.ts`) so this module
 * sees the real storyboards produced by Storyboard Engine (Sprint 4) and
 * the real Gemini Vision-analyzed asset library (Sprint 1/2), instead of
 * disconnected local seed arrays. Matching uses the shared scoring
 * utilities in `features/kontenai/lib/scoring.ts` (no real backend/AI
 * call, per explicit project-owner decision for this build phase).
 */

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Small margin within which an alternative asset is considered "close enough" to the top pick. */
const DIVERSITY_MARGIN = 0.1;

export async function listStoryboardsAction(): Promise<Storyboard[]> {
  await delay(200);
  return getMockDb().storyboards;
}

export async function listAssetLibraryAction(): Promise<AssetRecord[]> {
  await delay(200);
  return getMockDb().assets;
}

interface RankedAsset {
  asset: AssetRecord;
  tagMatchScore: number;
  rankingScore: number;
  matchedTags: string[];
}

/** Ranks every candidate asset against a scene's required tags. */
function rankAssetsForScene(scene: StoryboardScene, assets: AssetRecord[]): RankedAsset[] {
  const requiredLower = new Set(scene.requiredAssetTags.map((tag) => tag.toLowerCase()));

  return assets
    .map((asset) => {
      const tagMatchScore = computeTagMatchScore(scene.requiredAssetTags, asset.tags);
      const rankingScore = computeAssetRankingScore(tagMatchScore, asset.metadata?.qualityScore ?? null);
      const matchedTags = asset.tags.filter((tag) => requiredLower.has(tag.toLowerCase()));
      return { asset, tagMatchScore, rankingScore, matchedTags };
    })
    .sort((a, b) => b.rankingScore - a.rankingScore);
}

function buildRationale(scene: StoryboardScene, ranked: RankedAsset): string {
  const qualityScore = ranked.asset.metadata?.qualityScore ?? null;
  const qualityPart = qualityScore !== null ? ` (skor kualitas ${qualityScore}/10)` : "";

  if (ranked.matchedTags.length > 0) {
    return `Cocok pada tag: ${ranked.matchedTags.join(", ")}${qualityPart}.`;
  }

  return `Tidak ada tag yang cocok persis dengan kebutuhan scene (${scene.requiredAssetTags.join(", ") || "tanpa tag spesifik"}) -- dipilih sebagai kandidat terdekat dari pustaka aset${qualityPart}.`;
}

/**
 * For each scene, ranks every asset in the shared library by blended
 * tag-match + quality-score, picks the best one, applies a diversity
 * heuristic to avoid repeatedly reusing the same asset across scenes when
 * a close alternative exists, then persists the choice onto the real
 * Storyboard's scenes (so Render Engine sees it) and into
 * `assetSelections` in the shared mock-db.
 */
export async function selectAssetsForStoryboardAction(storyboardId: string): Promise<AssetSelection[]> {
  await delay(600 + Math.floor(Math.random() * 400));

  const db = getMockDb();
  const storyboard = db.storyboards.find((sb) => sb.id === storyboardId);
  if (!storyboard) {
    throw new Error(`Storyboard dengan id "${storyboardId}" tidak ditemukan.`);
  }

  const usedAssetIds = new Set<string>();
  const selections: AssetSelection[] = [];

  for (const scene of storyboard.scenes) {
    const ranked = rankAssetsForScene(scene, db.assets);
    if (ranked.length === 0) continue;

    let chosen = ranked[0];
    if (usedAssetIds.has(chosen.asset.id)) {
      const alternative = ranked.find(
        (candidate) => !usedAssetIds.has(candidate.asset.id) && chosen.rankingScore - candidate.rankingScore <= DIVERSITY_MARGIN,
      );
      if (alternative) {
        chosen = alternative;
      }
    }

    usedAssetIds.add(chosen.asset.id);

    // Persist the choice onto the real storyboard scene so Render Engine (Sprint 6) sees it.
    scene.selectedAssetId = chosen.asset.id;

    selections.push({
      storyboardId: storyboard.id,
      sceneId: scene.id,
      assetId: chosen.asset.id,
      matchScore: Math.round(chosen.rankingScore * 100) / 100,
      rationale: buildRationale(scene, chosen),
    });
  }

  // Replace any prior selections for this storyboard with the freshly computed ones.
  db.assetSelections = [...db.assetSelections.filter((selection) => selection.storyboardId !== storyboardId), ...selections];

  return selections;
}
