import type { StudioVerdict } from "@/features/kontenai/types";

/**
 * Mirrors the real Content Studio auto-publish threshold
 * (CONTENT_AUTO_PUBLISH_SCORE_THRESHOLD in features/markom) so KontenAI's
 * mocked pipeline behaves consistently with what Content Studio will
 * actually enforce once connected.
 */
export const CONTENT_STUDIO_AUTO_APPROVE_THRESHOLD = 8.5;

export function deriveStudioVerdict(score: number): StudioVerdict {
  return score >= CONTENT_STUDIO_AUTO_APPROVE_THRESHOLD ? "approved" : "needs_revision";
}

/** Jaccard-style overlap between a scene/brief's required tags and an asset's tags, scaled to 0-1. */
export function computeTagMatchScore(requiredTags: string[], candidateTags: string[]): number {
  if (requiredTags.length === 0) return candidateTags.length === 0 ? 0.5 : 0.6;
  const required = new Set(requiredTags.map((tag) => tag.toLowerCase()));
  const candidate = new Set(candidateTags.map((tag) => tag.toLowerCase()));
  let matches = 0;
  for (const tag of required) {
    if (candidate.has(tag)) matches += 1;
  }
  const coverage = matches / required.size;
  const noisePenalty = candidate.size > required.size ? Math.min(0.15, (candidate.size - required.size) * 0.02) : 0;
  return Math.max(0, Math.min(1, coverage - noisePenalty));
}

/** Blends a tag match score with an asset quality score (0-10) into a single 0-1 ranking score. */
export function computeAssetRankingScore(tagMatchScore: number, qualityScore: number | null): number {
  const normalizedQuality = (qualityScore ?? 6) / 10;
  return tagMatchScore * 0.7 + normalizedQuality * 0.3;
}

export function averageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2));
}

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
