"use server";

import { requirePermission } from "@/lib/rbac/session";
import type { AssetRecord, AssetType, AssetVisionMetadata } from "@/features/kontenai/types";
import { getMockDb } from "@/features/kontenai/lib/mock-db";

/**
 * Sprint 2 - Gemini Vision.
 *
 * This module is a UI/interaction scaffold only. There is no real
 * Gemini Vision API call here and no Supabase persistence -- both are
 * intentionally out of scope for this build phase (see repo-level
 * lib/ai/service.ts for the *unrelated* existing Gemini integration
 * used by "Modul AI", which this sprint does not touch or reuse).
 *
 * Assets are read from and written back into the shared in-memory
 * store (`features/kontenai/lib/mock-db.ts`) so Asset Library
 * (Sprint 1) and Asset Selector (Sprint 5) immediately see the same
 * analysis results. `analyzeAssetAction` derives a deterministic,
 * asset-aware fake result (informed by the real filename/tags/type)
 * instead of pure randomness, and mutates the asset's `metadata`
 * field in place. When the real integration is wired in a later
 * sprint, only the body of `analyzeAssetAction` needs to change --
 * the return shape already matches `AssetVisionMetadata`.
 */

async function requireGeminiVisionAccess() {
  await requirePermission("content_planner.view");
}

/**
 * Returns every asset currently in the shared store, analyzed or not --
 * the UI already distinguishes "Analyzed" vs "Pending" by whether
 * `metadata` is populated.
 */
export async function listAssetsForAnalysisAction(): Promise<AssetRecord[]> {
  await requireGeminiVisionAccess();
  return getMockDb().assets;
}

// ---------------------------------------------------------------------------
// Deterministic, asset-aware mock analysis
// ---------------------------------------------------------------------------

const OBJECT_BANK: Record<AssetType, string[]> = {
  image: ["orang", "bangunan", "tanaman", "furnitur", "langit", "produk", "teks overlay"],
  video: ["orang", "gerakan kamera", "interior ruangan", "produk", "transisi cepat"],
  audio: ["suara manusia", "musik latar", "jeda hening"],
  logo: ["wordmark", "ikon", "palet brand"],
  template: ["placeholder teks", "grid layout", "elemen dekoratif"],
};

const COLOR_BANK = ["#F2A65A", "#3B2E39", "#8AA6A3", "#C9B79C", "#6B4F3B", "#2563EB", "#F1F5F9", "#0F172A", "#DDE6D5", "#E11D48"];

const USE_CASE_BANK_BY_TYPE: Record<AssetType, string[]> = {
  image: ["thumbnail", "carousel_slide", "post_feed", "story_promo"],
  video: ["hook", "b_roll", "cta", "closing_shot"],
  audio: ["background_music", "voice_over", "transition_sfx"],
  logo: ["watermark", "brand_intro", "outro_stamp"],
  template: ["caption_overlay", "story_frame", "editable_layout"],
};

/** Simple deterministic hash so the same asset always yields a stable result. */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickN<T>(bank: T[], count: number, seed: number): T[] {
  const picked: T[] = [];
  let cursor = seed;
  for (let i = 0; i < count && picked.length < bank.length; i += 1) {
    cursor = (cursor * 1103515245 + 12345) >>> 0;
    const candidate = bank[cursor % bank.length];
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked;
}

/** Tokenizes a filename into human-ish words, dropping the extension and separators. */
function tokenizeFilename(filename: string): string[] {
  return filename
    .replace(/\.[^/.]+$/, "")
    .split(/[-_\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
}

/**
 * Deterministic 0-10 quality heuristic based on real asset properties:
 * a meaningful baseline (tag richness, filename descriptiveness, type/size
 * sanity) plus a small seeded jitter for realism -- not pure Math.random().
 */
function computeQualityScore(asset: AssetRecord, seed: number): number {
  let score = 6;

  // More existing tags suggest the asset was already curated/described well.
  score += Math.min(1.5, asset.tags.length * 0.3);

  // A descriptive filename (several meaningful tokens) suggests care in capture/naming.
  const tokens = tokenizeFilename(asset.filename);
  score += Math.min(1, tokens.length * 0.15);

  // Size/duration sanity checks per type.
  if (asset.type === "video") {
    if (asset.durationSeconds && asset.durationSeconds >= 10 && asset.durationSeconds <= 60) {
      score += 0.5;
    }
    if (asset.sizeBytes > 5_000_000) score += 0.3;
  } else if (asset.type === "image") {
    if (asset.sizeBytes >= 500_000 && asset.sizeBytes <= 5_000_000) score += 0.5;
  } else if (asset.type === "audio") {
    if (asset.durationSeconds && asset.durationSeconds >= 10) score += 0.3;
  } else if (asset.type === "logo") {
    score += 0.2; // logos are typically small/simple by design, not a penalty
  }

  // Small deterministic jitter derived from the asset's own seed, +/-0.5.
  const jitter = ((seed % 101) / 100 - 0.5) * 1;
  score += jitter;

  return Math.min(10, Math.max(0, Math.round(score * 10) / 10));
}

/** Picks brand/type-aware suggested use cases, biased by the asset's own tags. */
function deriveSuggestedUseCases(asset: AssetRecord, seed: number): string[] {
  const bank = USE_CASE_BANK_BY_TYPE[asset.type] ?? USE_CASE_BANK_BY_TYPE.image;
  const count = Math.min(bank.length, 2 + (seed % 2));
  return pickN(bank, count, seed >> 4);
}

/** Derives detected objects from existing tags first, topped up from the type-based bank. */
function deriveDetectedObjects(asset: AssetRecord, seed: number): string[] {
  const fromTags = asset.tags.slice(0, 3);
  const bank = OBJECT_BANK[asset.type] ?? OBJECT_BANK.image;
  const wanted = 3 + (seed % 3);
  const extras = pickN(
    bank.filter((item) => !fromTags.includes(item)),
    Math.max(0, wanted - fromTags.length),
    seed,
  );
  return [...fromTags, ...extras];
}

function buildDescription(asset: AssetRecord, tokens: string[]): string {
  const subject = tokens.length > 0 ? tokens.join(" ") : asset.filename;
  const typeLabel: Record<AssetType, string> = {
    image: "gambar",
    video: "video",
    audio: "audio",
    logo: "logo",
    template: "template",
  };
  const primaryTag = asset.tags[0] ?? "konten promosi";
  return `Analisis Gemini Vision (mock) untuk "${subject}": ${typeLabel[asset.type] ?? asset.type} bertema ${primaryTag}, ` +
    `dengan ${asset.tags.length} tag terdeteksi sebelumnya, cocok dikembangkan lebih lanjut untuk kebutuhan konten ${primaryTag}.`;
}

/**
 * PLACEHOLDER for the real Gemini Vision API call.
 *
 * In a later sprint this should call the shared AI provider (see
 * lib/ai/service.ts / lib/ai/provider/gemini-*.ts for the existing
 * pattern used elsewhere in the app) with the asset's URL/bytes and
 * map the model response into AssetVisionMetadata. For now it derives
 * a deterministic, asset-aware result from the asset's real filename,
 * tags and type (looked up from the shared store), and mutates that
 * asset's `metadata` in place so other KontenAI modules see it too.
 */
export async function analyzeAssetAction(assetId: string): Promise<AssetVisionMetadata> {
  await requireGeminiVisionAccess();

  const db = getMockDb();
  const asset = db.assets.find((item) => item.id === assetId);
  if (!asset) {
    throw new Error(`Asset ${assetId} tidak ditemukan`);
  }

  const seed = hashString(asset.id + asset.filename);
  const delayMs = 600 + (seed % 601); // 600-1200ms, simulates API latency
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const tokens = tokenizeFilename(asset.filename);
  const detectedObjects = deriveDetectedObjects(asset, seed);
  const dominantColors = pickN(COLOR_BANK, 3, seed >> 2);
  const suggestedUseCases = deriveSuggestedUseCases(asset, seed);
  const qualityScore = computeQualityScore(asset, seed);

  const result: AssetVisionMetadata = {
    assetId: asset.id,
    description: buildDescription(asset, tokens),
    detectedObjects,
    dominantColors,
    qualityScore,
    suggestedUseCases,
    analyzedAt: new Date().toISOString(),
  };

  // Mutate the shared store in place so Asset Library / Asset Selector see it immediately.
  asset.metadata = result;

  return result;
}

/**
 * Runs `analyzeAssetAction` sequentially over every currently-unanalyzed
 * asset in the shared store and returns the resulting metadata list.
 * Additive convenience action -- the existing "Analisis Semua" button in
 * the UI already loops over `analyzeAssetAction` client-side and keeps
 * working unchanged; this is provided as a single-call alternative for
 * callers (e.g. Production Pipeline) that want one server round trip.
 */
export async function analyzeAllPendingAction(): Promise<AssetVisionMetadata[]> {
  await requireGeminiVisionAccess();

  const db = getMockDb();
  const pendingIds = db.assets.filter((asset) => asset.metadata === null).map((asset) => asset.id);

  const results: AssetVisionMetadata[] = [];
  for (const id of pendingIds) {
    // Sequential on purpose: mirrors a real rate-limited Vision API queue
    // and keeps the shared store mutation order deterministic.
    const metadata = await analyzeAssetAction(id);
    results.push(metadata);
  }

  return results;
}
