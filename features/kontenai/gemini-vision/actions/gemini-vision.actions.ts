"use server";

import { requirePermission } from "@/lib/rbac/session";
import type { AssetRecord, AssetVisionMetadata } from "@/features/kontenai/types";

/**
 * Sprint 2 - Gemini Vision.
 *
 * This module is a UI/interaction scaffold only. There is no real
 * Gemini Vision API call here and no Supabase persistence -- both are
 * intentionally out of scope for this build phase (see repo-level
 * lib/ai/service.ts for the *unrelated* existing Gemini integration
 * used by "Modul AI", which this sprint does not touch or reuse).
 *
 * Everything below is an in-memory mock: `listAssetsForAnalysisAction`
 * seeds a fake Asset Library slice (Sprint 1 builds the real one in
 * parallel), and `analyzeAssetAction` simulates a Gemini Vision call
 * with a delay and a plausible, deterministic-ish fake result. When
 * the real integration is wired in a later sprint, only the body of
 * `analyzeAssetAction` needs to change -- the return shape already
 * matches `AssetVisionMetadata`.
 */

async function requireGeminiVisionAccess() {
  await requirePermission("content_planner.view");
}

// ---------------------------------------------------------------------------
// Mock seed data
// ---------------------------------------------------------------------------

const MOCK_ASSETS: AssetRecord[] = [
  {
    id: "asset-001",
    type: "image",
    filename: "villa-cariu-sunset-facade.jpg",
    url: "https://picsum.photos/seed/villa-cariu-sunset-facade/800/600",
    thumbnailUrl: "https://picsum.photos/seed/villa-cariu-sunset-facade/200/150",
    sizeBytes: 2_431_000,
    durationSeconds: null,
    tags: ["villa", "eksterior", "golden-hour"],
    uploadedAt: "2026-07-14T03:12:00.000Z",
    uploadedBy: "Ayu Marketing",
    metadata: {
      assetId: "asset-001",
      description: "Fasad villa dua lantai dengan kolam renang privat, difoto saat golden hour dengan langit oranye kemerahan.",
      detectedObjects: ["villa", "kolam renang", "langit senja", "tanaman tropis"],
      dominantColors: ["#F2A65A", "#3B2E39", "#8AA6A3"],
      qualityScore: 8.7,
      suggestedUseCases: ["Post hero Instagram", "Thumbnail iklan Meta", "Cover reel TikTok"],
      analyzedAt: "2026-07-14T04:00:00.000Z",
    },
  },
  {
    id: "asset-002",
    type: "video",
    filename: "kos-cariu-room-tour.mp4",
    url: "https://example.com/mock/kos-cariu-room-tour.mp4",
    thumbnailUrl: "https://picsum.photos/seed/kos-cariu-room-tour/200/150",
    sizeBytes: 48_200_000,
    durationSeconds: 42,
    tags: ["kos", "room-tour", "interior"],
    uploadedAt: "2026-07-15T07:45:00.000Z",
    uploadedBy: "Bagas Konten",
    metadata: null,
  },
  {
    id: "asset-003",
    type: "image",
    filename: "beauty-clinic-treatment-room.jpg",
    url: "https://picsum.photos/seed/beauty-clinic-treatment-room/800/600",
    thumbnailUrl: "https://picsum.photos/seed/beauty-clinic-treatment-room/200/150",
    sizeBytes: 1_890_000,
    durationSeconds: null,
    tags: ["beauty", "klinik", "interior"],
    uploadedAt: "2026-07-16T01:20:00.000Z",
    uploadedBy: "Sinta Beauty",
    metadata: null,
  },
  {
    id: "asset-004",
    type: "video",
    filename: "sales-testimoni-leasehold.mp4",
    url: "https://example.com/mock/sales-testimoni-leasehold.mp4",
    thumbnailUrl: "https://picsum.photos/seed/sales-testimoni-leasehold/200/150",
    sizeBytes: 63_500_000,
    durationSeconds: 58,
    tags: ["testimoni", "leasehold", "sales"],
    uploadedAt: "2026-07-16T09:05:00.000Z",
    uploadedBy: "Rian Sales",
    metadata: {
      assetId: "asset-004",
      description: "Klien memberikan testimoni tentang pengalaman menyewa villa leasehold, direkam di teras dengan pencahayaan alami.",
      detectedObjects: ["orang", "teras", "kursi rotan", "tanaman hias"],
      dominantColors: ["#C9B79C", "#6B4F3B", "#DDE6D5"],
      qualityScore: 7.4,
      suggestedUseCases: ["Reel testimoni", "Iklan retargeting", "Konten trust-building website"],
      analyzedAt: "2026-07-16T09:30:00.000Z",
    },
  },
  {
    id: "asset-005",
    type: "image",
    filename: "logo-mk-connect-primary.png",
    url: "https://picsum.photos/seed/logo-mk-connect-primary/800/600",
    thumbnailUrl: "https://picsum.photos/seed/logo-mk-connect-primary/200/150",
    sizeBytes: 84_000,
    durationSeconds: null,
    tags: ["logo", "brand"],
    uploadedAt: "2026-06-02T02:00:00.000Z",
    uploadedBy: "Design Team",
    metadata: null,
  },
  {
    id: "asset-006",
    type: "template",
    filename: "ig-story-template-promo.psd",
    url: "https://example.com/mock/ig-story-template-promo.psd",
    thumbnailUrl: "https://picsum.photos/seed/ig-story-template-promo/200/150",
    sizeBytes: 12_400_000,
    durationSeconds: null,
    tags: ["template", "promo", "story"],
    uploadedAt: "2026-06-20T05:30:00.000Z",
    uploadedBy: "Design Team",
    metadata: null,
  },
  {
    id: "asset-007",
    type: "image",
    filename: "occupancy-dashboard-screenshot.png",
    url: "https://picsum.photos/seed/occupancy-dashboard-screenshot/800/600",
    thumbnailUrl: "https://picsum.photos/seed/occupancy-dashboard-screenshot/200/150",
    sizeBytes: 640_000,
    durationSeconds: null,
    tags: ["occupancy", "data", "internal"],
    uploadedAt: "2026-07-10T06:00:00.000Z",
    uploadedBy: "Ops Team",
    metadata: {
      assetId: "asset-007",
      description: "Tangkapan layar dashboard okupansi kos menampilkan grafik tren bulanan dan indikator kamar tersedia.",
      detectedObjects: ["grafik", "tabel", "antarmuka dashboard"],
      dominantColors: ["#2563EB", "#F1F5F9", "#0F172A"],
      qualityScore: 5.2,
      suggestedUseCases: ["Materi internal rapat", "Bukan untuk publikasi publik"],
      analyzedAt: "2026-07-10T06:10:00.000Z",
    },
  },
  {
    id: "asset-008",
    type: "video",
    filename: "tiktok-hook-first3seconds.mp4",
    url: "https://example.com/mock/tiktok-hook-first3seconds.mp4",
    thumbnailUrl: "https://picsum.photos/seed/tiktok-hook-first3seconds/200/150",
    sizeBytes: 21_000_000,
    durationSeconds: 15,
    tags: ["tiktok", "hook", "raw-footage"],
    uploadedAt: "2026-07-18T11:15:00.000Z",
    uploadedBy: "Bagas Konten",
    metadata: null,
  },
  {
    id: "asset-009",
    type: "audio",
    filename: "vo-narasi-promo-agustus.mp3",
    url: "https://example.com/mock/vo-narasi-promo-agustus.mp3",
    thumbnailUrl: null,
    sizeBytes: 3_100_000,
    durationSeconds: 34,
    tags: ["voice-over", "narasi"],
    uploadedAt: "2026-07-19T02:40:00.000Z",
    uploadedBy: "Audio Team",
    metadata: null,
  },
  {
    id: "asset-010",
    type: "image",
    filename: "villa-cariu-kitchen-detail.jpg",
    url: "https://picsum.photos/seed/villa-cariu-kitchen-detail/800/600",
    thumbnailUrl: "https://picsum.photos/seed/villa-cariu-kitchen-detail/200/150",
    sizeBytes: 2_050_000,
    durationSeconds: null,
    tags: ["villa", "interior", "dapur"],
    uploadedAt: "2026-07-19T08:00:00.000Z",
    uploadedBy: "Ayu Marketing",
    metadata: null,
  },
];

/**
 * Returns the current Asset Library slice awaiting/eligible for Gemini
 * Vision analysis. In production this reads from the Sprint 1 Asset
 * Library store; here it returns a fixed in-memory seed so this module
 * can be built and reviewed independently.
 */
export async function listAssetsForAnalysisAction(): Promise<AssetRecord[]> {
  await requireGeminiVisionAccess();
  return MOCK_ASSETS;
}

// ---------------------------------------------------------------------------
// Mock analysis
// ---------------------------------------------------------------------------

const OBJECT_BANK: Record<string, string[]> = {
  image: ["orang", "bangunan", "tanaman", "furnitur", "langit", "produk", "teks overlay"],
  video: ["orang", "gerakan kamera", "interior ruangan", "produk", "transisi cepat"],
  audio: ["suara manusia", "musik latar", "jeda hening"],
  logo: ["wordmark", "ikon", "palet brand"],
  template: ["placeholder teks", "grid layout", "elemen dekoratif"],
};

const COLOR_BANK = ["#F2A65A", "#3B2E39", "#8AA6A3", "#C9B79C", "#6B4F3B", "#2563EB", "#F1F5F9", "#0F172A", "#DDE6D5", "#E11D48"];

const USE_CASE_BANK = [
  "Post feed Instagram",
  "Thumbnail iklan Meta",
  "Cover reel TikTok",
  "Materi story promo",
  "Konten trust-building website",
  "Referensi internal moodboard",
];

/** Simple deterministic-ish hash so the same asset tends to get a stable-ish result. */
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

/**
 * PLACEHOLDER for the real Gemini Vision API call.
 *
 * In a later sprint this should call the shared AI provider (see
 * lib/ai/service.ts / lib/ai/provider/gemini-*.ts for the existing
 * pattern used elsewhere in the app) with the asset's URL/bytes and
 * map the model response into AssetVisionMetadata. For now it just
 * waits a bit and fabricates a plausible result from the asset's own
 * filename/type/id so the UI has something realistic to render.
 */
export async function analyzeAssetAction(assetId: string): Promise<AssetVisionMetadata> {
  await requireGeminiVisionAccess();

  const asset = MOCK_ASSETS.find((item) => item.id === assetId);
  if (!asset) {
    throw new Error(`Asset ${assetId} tidak ditemukan`);
  }

  const seed = hashString(asset.id + asset.filename);
  const delayMs = 600 + (seed % 601); // 600-1200ms
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const objectBank = OBJECT_BANK[asset.type] ?? OBJECT_BANK.image;
  const detectedObjects = pickN(objectBank, 3 + (seed % 3), seed);
  const dominantColors = pickN(COLOR_BANK, 3, seed >> 2);
  const suggestedUseCases = pickN(USE_CASE_BANK, 2 + (seed % 2), seed >> 4);
  const qualityScore = Math.round(((seed % 41) / 41) * 4 + 6) / 1 + ((seed % 10) / 10); // roughly 6.0-10.0
  const clampedQualityScore = Math.min(10, Math.max(0, Math.round(qualityScore * 10) / 10));

  const baseName = asset.filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  return {
    assetId: asset.id,
    description: `Analisis Gemini Vision (mock) untuk "${baseName}": ${asset.type === "video" ? "video" : asset.type} dengan komposisi yang cukup jelas, cocok untuk konten ${asset.tags[0] ?? "promosi"}.`,
    detectedObjects,
    dominantColors,
    qualityScore: clampedQualityScore,
    suggestedUseCases,
    analyzedAt: new Date().toISOString(),
  };
}
