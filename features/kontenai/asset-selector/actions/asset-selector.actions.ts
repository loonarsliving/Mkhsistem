"use server";

import type { AssetRecord, AssetSelection, Storyboard } from "@/features/kontenai/types";

/**
 * Sprint 5 - Asset Selector. Mocked/in-memory data + matching only (no
 * real backend or AI call yet, per explicit project-owner decision for
 * this build phase). Storyboards are Sprint 4's output shape; the asset
 * library is Sprint 1's output shape. Both are seeded locally here so
 * this module can be built and demoed independently while Sprint 1 and
 * Sprint 4 are developed in parallel.
 */

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_STORYBOARDS: Storyboard[] = [
  {
    id: "sb-001",
    directiveId: "dir-leasehold-001",
    totalDurationSeconds: 28,
    createdAt: "2026-07-14T02:00:00.000Z",
    scenes: [
      {
        id: "sb-001-sc-1",
        order: 1,
        description: "Hook aerial shot of the villa exterior at golden hour",
        durationSeconds: 4,
        transition: "cut",
        textOverlay: "Rumah impian di Jogja Selatan",
        requiredAssetTags: ["villa", "exterior", "golden-hour", "aerial"],
        selectedAssetId: null,
      },
      {
        id: "sb-001-sc-2",
        order: 2,
        description: "Walkthrough of the living room and open kitchen",
        durationSeconds: 6,
        transition: "fade",
        textOverlay: "Ruang tamu luas & dapur terbuka",
        requiredAssetTags: ["interior", "living-room", "kitchen"],
        selectedAssetId: null,
      },
      {
        id: "sb-001-sc-3",
        order: 3,
        description: "Close-up of the master bedroom with natural light",
        durationSeconds: 5,
        transition: "cut",
        textOverlay: "Kamar utama yang tenang",
        requiredAssetTags: ["bedroom", "interior", "natural-light"],
        selectedAssetId: null,
      },
      {
        id: "sb-001-sc-4",
        order: 4,
        description: "Pool and garden area, lifestyle framing",
        durationSeconds: 6,
        transition: "slide",
        textOverlay: "Kolam renang pribadi",
        requiredAssetTags: ["pool", "garden", "lifestyle"],
        selectedAssetId: null,
      },
      {
        id: "sb-001-sc-5",
        order: 5,
        description: "Closing CTA card with logo and contact",
        durationSeconds: 7,
        transition: "zoom",
        textOverlay: "Hubungi kami sekarang",
        requiredAssetTags: ["logo", "cta"],
        selectedAssetId: null,
      },
    ],
  },
  {
    id: "sb-002",
    directiveId: "dir-occupancy-002",
    totalDurationSeconds: 22,
    createdAt: "2026-07-15T05:30:00.000Z",
    scenes: [
      {
        id: "sb-002-sc-1",
        order: 1,
        description: "Kos exterior signage and entrance",
        durationSeconds: 4,
        transition: "cut",
        textOverlay: "Kos nyaman & strategis",
        requiredAssetTags: ["kos", "exterior", "signage"],
        selectedAssetId: null,
      },
      {
        id: "sb-002-sc-2",
        order: 2,
        description: "Room tour, bed and study desk",
        durationSeconds: 6,
        transition: "fade",
        textOverlay: "Kamar bersih & lengkap",
        requiredAssetTags: ["room", "interior", "furniture"],
        selectedAssetId: null,
      },
      {
        id: "sb-002-sc-3",
        order: 3,
        description: "Shared kitchen and common area",
        durationSeconds: 5,
        transition: "cut",
        textOverlay: "Dapur bersama yang lengkap",
        requiredAssetTags: ["kitchen", "common-area", "interior"],
        selectedAssetId: null,
      },
      {
        id: "sb-002-sc-4",
        order: 4,
        description: "Closing CTA with logo and booking link",
        durationSeconds: 7,
        transition: "zoom",
        textOverlay: "Booking sekarang",
        requiredAssetTags: ["logo", "cta"],
        selectedAssetId: null,
      },
    ],
  },
  {
    id: "sb-003",
    directiveId: "dir-beauty-003",
    totalDurationSeconds: 20,
    createdAt: "2026-07-16T09:15:00.000Z",
    scenes: [
      {
        id: "sb-003-sc-1",
        order: 1,
        description: "Product hero shot, clean studio background",
        durationSeconds: 4,
        transition: "cut",
        textOverlay: "Perkenalkan produk terbaru kami",
        requiredAssetTags: ["product", "studio", "beauty"],
        selectedAssetId: null,
      },
      {
        id: "sb-003-sc-2",
        order: 2,
        description: "Before/after skin texture close-up",
        durationSeconds: 5,
        transition: "fade",
        textOverlay: "Hasil nyata dalam 2 minggu",
        requiredAssetTags: ["before-after", "skin", "closeup"],
        selectedAssetId: null,
      },
      {
        id: "sb-003-sc-3",
        order: 3,
        description: "Model applying the product, lifestyle shot",
        durationSeconds: 5,
        transition: "slide",
        textOverlay: "Mudah digunakan sehari-hari",
        requiredAssetTags: ["model", "lifestyle", "beauty"],
        selectedAssetId: null,
      },
      {
        id: "sb-003-sc-4",
        order: 4,
        description: "Closing CTA with logo and promo code",
        durationSeconds: 6,
        transition: "zoom",
        textOverlay: "Diskon 20% minggu ini",
        requiredAssetTags: ["logo", "cta", "promo"],
        selectedAssetId: null,
      },
    ],
  },
  {
    id: "sb-004",
    directiveId: "dir-leasehold-004",
    totalDurationSeconds: 18,
    createdAt: "2026-07-18T03:45:00.000Z",
    scenes: [
      {
        id: "sb-004-sc-1",
        order: 1,
        description: "Drone flyover of the neighbourhood at sunrise",
        durationSeconds: 5,
        transition: "cut",
        textOverlay: "Lokasi strategis dekat kota",
        requiredAssetTags: ["aerial", "neighbourhood", "golden-hour"],
        selectedAssetId: null,
      },
      {
        id: "sb-004-sc-2",
        order: 2,
        description: "Rooftop terrace with city view",
        durationSeconds: 6,
        transition: "fade",
        textOverlay: "Rooftop dengan pemandangan kota",
        requiredAssetTags: ["rooftop", "exterior", "lifestyle"],
        selectedAssetId: null,
      },
      {
        id: "sb-004-sc-3",
        order: 3,
        description: "Closing CTA card with logo and price",
        durationSeconds: 7,
        transition: "zoom",
        textOverlay: "Mulai dari harga spesial",
        requiredAssetTags: ["logo", "cta"],
        selectedAssetId: null,
      },
    ],
  },
];

const MOCK_ASSET_LIBRARY: AssetRecord[] = [
  { id: "as-01", type: "image", filename: "villa-aerial-golden-hour-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 4_200_000, durationSeconds: null, tags: ["villa", "exterior", "golden-hour", "aerial"], uploadedAt: "2026-06-01T00:00:00.000Z", uploadedBy: "Dina (Markom)", metadata: null },
  { id: "as-02", type: "video", filename: "villa-drone-flyover-01.mp4", url: "#", thumbnailUrl: null, sizeBytes: 38_500_000, durationSeconds: 12, tags: ["aerial", "villa", "neighbourhood", "golden-hour"], uploadedAt: "2026-06-02T00:00:00.000Z", uploadedBy: "Dina (Markom)", metadata: null },
  { id: "as-03", type: "image", filename: "living-room-open-kitchen-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 3_100_000, durationSeconds: null, tags: ["interior", "living-room", "kitchen"], uploadedAt: "2026-06-02T00:00:00.000Z", uploadedBy: "Rizky (Markom)", metadata: null },
  { id: "as-04", type: "video", filename: "living-room-walkthrough-01.mp4", url: "#", thumbnailUrl: null, sizeBytes: 22_000_000, durationSeconds: 8, tags: ["interior", "living-room"], uploadedAt: "2026-06-03T00:00:00.000Z", uploadedBy: "Rizky (Markom)", metadata: null },
  { id: "as-05", type: "image", filename: "master-bedroom-natural-light-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 2_900_000, durationSeconds: null, tags: ["bedroom", "interior", "natural-light"], uploadedAt: "2026-06-03T00:00:00.000Z", uploadedBy: "Dina (Markom)", metadata: null },
  { id: "as-06", type: "image", filename: "bedroom-closeup-soft-light-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 2_400_000, durationSeconds: null, tags: ["bedroom", "natural-light"], uploadedAt: "2026-06-04T00:00:00.000Z", uploadedBy: "Rizky (Markom)", metadata: null },
  { id: "as-07", type: "video", filename: "pool-garden-lifestyle-01.mp4", url: "#", thumbnailUrl: null, sizeBytes: 41_000_000, durationSeconds: 14, tags: ["pool", "garden", "lifestyle"], uploadedAt: "2026-06-05T00:00:00.000Z", uploadedBy: "Dina (Markom)", metadata: null },
  { id: "as-08", type: "image", filename: "pool-sunset-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 3_600_000, durationSeconds: null, tags: ["pool", "golden-hour"], uploadedAt: "2026-06-05T00:00:00.000Z", uploadedBy: "Rizky (Markom)", metadata: null },
  { id: "as-09", type: "logo", filename: "loonars-living-logo-cta.png", url: "#", thumbnailUrl: null, sizeBytes: 180_000, durationSeconds: null, tags: ["logo", "cta"], uploadedAt: "2026-05-20T00:00:00.000Z", uploadedBy: "Design Team", metadata: null },
  { id: "as-10", type: "template", filename: "cta-card-template-01.png", url: "#", thumbnailUrl: null, sizeBytes: 210_000, durationSeconds: null, tags: ["cta", "logo", "template"], uploadedAt: "2026-05-21T00:00:00.000Z", uploadedBy: "Design Team", metadata: null },
  { id: "as-11", type: "image", filename: "kos-exterior-signage-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 2_800_000, durationSeconds: null, tags: ["kos", "exterior", "signage"], uploadedAt: "2026-06-10T00:00:00.000Z", uploadedBy: "Sinta (Markom)", metadata: null },
  { id: "as-12", type: "video", filename: "kos-room-tour-01.mp4", url: "#", thumbnailUrl: null, sizeBytes: 26_000_000, durationSeconds: 10, tags: ["room", "interior", "furniture"], uploadedAt: "2026-06-11T00:00:00.000Z", uploadedBy: "Sinta (Markom)", metadata: null },
  { id: "as-13", type: "image", filename: "kos-shared-kitchen-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 2_500_000, durationSeconds: null, tags: ["kitchen", "common-area", "interior"], uploadedAt: "2026-06-11T00:00:00.000Z", uploadedBy: "Sinta (Markom)", metadata: null },
  { id: "as-14", type: "image", filename: "rooftop-city-view-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 3_300_000, durationSeconds: null, tags: ["rooftop", "exterior", "lifestyle"], uploadedAt: "2026-06-12T00:00:00.000Z", uploadedBy: "Dina (Markom)", metadata: null },
  { id: "as-15", type: "image", filename: "beauty-product-hero-studio-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 2_100_000, durationSeconds: null, tags: ["product", "studio", "beauty"], uploadedAt: "2026-06-15T00:00:00.000Z", uploadedBy: "Wulan (Beauty)", metadata: null },
  { id: "as-16", type: "image", filename: "beauty-before-after-skin-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 1_900_000, durationSeconds: null, tags: ["before-after", "skin", "closeup"], uploadedAt: "2026-06-16T00:00:00.000Z", uploadedBy: "Wulan (Beauty)", metadata: null },
  { id: "as-17", type: "video", filename: "beauty-model-lifestyle-01.mp4", url: "#", thumbnailUrl: null, sizeBytes: 30_000_000, durationSeconds: 9, tags: ["model", "lifestyle", "beauty"], uploadedAt: "2026-06-17T00:00:00.000Z", uploadedBy: "Wulan (Beauty)", metadata: null },
  { id: "as-18", type: "template", filename: "promo-20-percent-cta-01.png", url: "#", thumbnailUrl: null, sizeBytes: 195_000, durationSeconds: null, tags: ["promo", "cta", "logo"], uploadedAt: "2026-06-18T00:00:00.000Z", uploadedBy: "Design Team", metadata: null },
  { id: "as-19", type: "audio", filename: "upbeat-corporate-bg-01.mp3", url: "#", thumbnailUrl: null, sizeBytes: 3_400_000, durationSeconds: 30, tags: ["music", "upbeat"], uploadedAt: "2026-05-10T00:00:00.000Z", uploadedBy: "Design Team", metadata: null },
  { id: "as-20", type: "image", filename: "generic-office-lifestyle-01.jpg", url: "#", thumbnailUrl: null, sizeBytes: 2_000_000, durationSeconds: null, tags: ["lifestyle", "interior"], uploadedAt: "2026-05-25T00:00:00.000Z", uploadedBy: "Rizky (Markom)", metadata: null },
];

export async function listStoryboardsAction(): Promise<Storyboard[]> {
  await delay(200);
  return MOCK_STORYBOARDS;
}

export async function listAssetLibraryAction(): Promise<AssetRecord[]> {
  await delay(200);
  return MOCK_ASSET_LIBRARY;
}

/** Tag overlap ratio, weighted against how many tags the scene requires. */
function scoreAsset(requiredTags: string[], asset: AssetRecord): { score: number; matchedTags: string[] } {
  const requiredSet = new Set(requiredTags.map((t) => t.toLowerCase()));
  const assetTagSet = new Set(asset.tags.map((t) => t.toLowerCase()));
  const matchedTags = requiredTags.filter((tag) => assetTagSet.has(tag.toLowerCase()));
  if (requiredSet.size === 0) return { score: 0.3, matchedTags: [] };
  const score = matchedTags.length / requiredSet.size;
  return { score, matchedTags };
}

/**
 * Simulates the (future) AI matching call: for each scene, ranks every
 * asset in the library by required-tag overlap and picks the best one.
 * Ties fall back to the asset with more total matching tag surface, then
 * to the first uploaded.
 */
export async function selectAssetsForStoryboardAction(storyboardId: string): Promise<AssetSelection[]> {
  await delay(600 + Math.floor(Math.random() * 400));

  const storyboard = MOCK_STORYBOARDS.find((sb) => sb.id === storyboardId);
  if (!storyboard) return [];

  return storyboard.scenes.map((scene) => {
    let best: { asset: AssetRecord; score: number; matchedTags: string[] } | null = null;

    for (const asset of MOCK_ASSET_LIBRARY) {
      const { score, matchedTags } = scoreAsset(scene.requiredAssetTags, asset);
      if (!best || score > best.score) {
        best = { asset, score, matchedTags };
      }
    }

    // best is always set because MOCK_ASSET_LIBRARY is non-empty.
    const { asset, score, matchedTags } = best!;
    const rationale =
      matchedTags.length > 0
        ? `Cocok pada tag: ${matchedTags.join(", ")} (${matchedTags.length}/${scene.requiredAssetTags.length} tag terpenuhi).`
        : `Tidak ada tag yang cocok persis -- dipilih sebagai kandidat terdekat dari pustaka aset.`;

    return {
      storyboardId: storyboard.id,
      sceneId: scene.id,
      assetId: asset.id,
      matchScore: Math.round(score * 100) / 100,
      rationale,
    } satisfies AssetSelection;
  });
}
