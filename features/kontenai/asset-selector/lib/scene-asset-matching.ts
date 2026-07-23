import type { KontenAiAnalyzedAsset } from "@/repositories/kontenai-assets.repository";
import type { KontenAiSceneAssetMatch, KontenAiStoryboardScene } from "@/repositories/kontenai-storyboards.repository";

/** How many alternatives to surface per scene -- "Tampilkan 5 alternatif asset untuk setiap scene". */
export const MAX_ALTERNATIVES_PER_SCENE = 5;

/** Within this many points of the top score, an unused alternative is preferred over reusing an asset already picked for an earlier scene. */
const DIVERSITY_MARGIN = 8;

const STOPWORDS = new Set([
  "yang", "dengan", "untuk", "dari", "dan", "atau", "ke", "di", "para", "akan", "agar", "adalah",
  "sebagai", "pada", "ini", "itu", "the", "and", "for", "with", "scene", "shot", "video", "foto",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  );
}

function sceneTokens(scene: Pick<KontenAiStoryboardScene, "sceneTitle" | "visualDescription" | "onScreenText">): Set<string> {
  return tokenize([scene.sceneTitle, scene.visualDescription, scene.onScreenText].join(" "));
}

function assetTokens(asset: KontenAiAnalyzedAsset): Set<string> {
  return tokenize(
    [asset.aiTitle ?? asset.title, asset.aiDescription ?? "", asset.aiTags.join(" "), asset.aiCategory ?? "", asset.aiMood ?? "", asset.aiDetectedObjects.join(" ")].join(
      " ",
    ),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Scores how relevant one Asset Library entry is for one storyboard scene,
 * using only the metadata Gemini Vision already produced (Sprint 2) --
 * tags, category, mood, detected objects, description. No live AI call:
 * word-overlap (Jaccard) between the scene's text and the asset's Gemini
 * Vision metadata, with a bonus when a scene keyword is an exact tag match
 * (tags are curated, so an exact hit is a stronger signal than a loose
 * description overlap). Returns 0-100.
 */
export function scoreSceneAssetMatch(
  scene: Pick<KontenAiStoryboardScene, "sceneTitle" | "visualDescription" | "onScreenText">,
  asset: KontenAiAnalyzedAsset,
): number {
  const sceneWords = sceneTokens(scene);
  const overlap = jaccard(sceneWords, assetTokens(asset));

  const tagSet = new Set(asset.aiTags.map((tag) => tag.toLowerCase()));
  let exactTagHits = 0;
  for (const word of sceneWords) if (tagSet.has(word)) exactTagHits += 1;
  const tagBonus = Math.min(exactTagHits * 0.12, 0.4);

  return Math.round(Math.min(overlap + tagBonus, 1) * 100);
}

export interface SceneAssetSelection {
  selectedAssetId: string | null;
  assetMatches: KontenAiSceneAssetMatch[];
}

/**
 * Ranks the whole asset pool against every scene, auto-picks the best match
 * per scene, and applies a light diversity nudge so the same asset isn't
 * mechanically reused across every scene when a close alternative exists --
 * mirrors the diversity heuristic from the Sprint 5 mock module.
 */
export function matchAssetsToScenes(
  scenes: Pick<KontenAiStoryboardScene, "sceneTitle" | "visualDescription" | "onScreenText">[],
  assetPool: KontenAiAnalyzedAsset[],
): SceneAssetSelection[] {
  const usedAssetIds = new Set<string>();

  return scenes.map((scene) => {
    if (assetPool.length === 0) return { selectedAssetId: null, assetMatches: [] };

    const ranked = assetPool
      .map((asset) => ({ assetId: asset.id, score: scoreSceneAssetMatch(scene, asset) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ALTERNATIVES_PER_SCENE);

    let chosen = ranked[0];
    if (usedAssetIds.has(chosen.assetId)) {
      const alternative = ranked.find((candidate) => !usedAssetIds.has(candidate.assetId) && chosen.score - candidate.score <= DIVERSITY_MARGIN);
      if (alternative) chosen = alternative;
    }
    usedAssetIds.add(chosen.assetId);

    return { selectedAssetId: chosen.assetId, assetMatches: ranked };
  });
}
