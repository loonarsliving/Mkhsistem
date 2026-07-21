"use server";

import type { AssetRecord, AssetType, ContentFocus } from "@/features/kontenai/types";
import { CONTENT_FOCUS_VALUES } from "@/features/kontenai/lib/brands";
import { generateId } from "@/features/kontenai/lib/ids";
import { getMockDb } from "@/features/kontenai/lib/mock-db";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

/**
 * Sprint 1 - Asset Library. Reads/writes go through the shared
 * `getMockDb().assets` array (features/kontenai/lib/mock-db.ts) so every
 * other sprint (Gemini Vision, Asset Selector, Render Engine, ...) sees
 * the same assets this module manages. There is still no Supabase table
 * or storage bucket wired up (explicit project-owner decision for this
 * build phase), so uploads/deletes/tag edits only mutate the in-memory
 * store with an artificial delay to emulate network latency.
 */

const ASSET_TYPES: AssetType[] = ["image", "video", "audio", "logo", "template"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

export interface ListAssetsParams {
  type?: AssetType;
  tag?: string;
  brand?: ContentFocus;
  query?: string;
}

/**
 * Existing cross-sprint signature (see integration-contract.ts): callers
 * invoke this with no arguments today, so `params` stays optional and
 * defaulted -- passing a params object additionally filters server-side.
 */
export async function listAssetsAction(params?: ListAssetsParams): Promise<AssetRecord[]> {
  await delay(150);
  const assets = getMockDb().assets;
  if (!params) return assets;

  const query = params.query?.trim().toLowerCase();

  return assets.filter((asset) => {
    if (params.type && asset.type !== params.type) return false;
    if (params.tag && !asset.tags.includes(params.tag)) return false;
    if (params.brand && !asset.tags.includes(params.brand)) return false;
    if (query) {
      const haystack = [
        asset.filename,
        ...asset.tags,
        asset.metadata?.description ?? "",
        ...(asset.metadata?.suggestedUseCases ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export interface UploadAssetInput {
  filename: string;
  type: AssetType;
  tags: string[];
  sizeBytes: number;
  durationSeconds: number | null;
}

/** Mock upload: validates input, builds a full AssetRecord (unanalyzed) and pushes it into the shared store. */
export async function uploadAssetAction(input: UploadAssetInput): Promise<ActionResult<AssetRecord>> {
  await delay(200);

  const filename = input.filename?.trim() ?? "";
  if (!filename) {
    return actionError("Nama file tidak boleh kosong");
  }
  if (!ASSET_TYPES.includes(input.type)) {
    return actionError("Tipe aset tidak valid");
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return actionError("Ukuran file harus lebih besar dari 0");
  }

  const id = generateId("asset");
  const asset: AssetRecord = {
    id,
    type: input.type,
    filename,
    url: `https://assets.mock.kontenai.local/${filename}`,
    thumbnailUrl: input.type === "video" || input.type === "image" ? `https://assets.mock.kontenai.local/thumbs/${filename}.jpg` : null,
    sizeBytes: input.sizeBytes,
    durationSeconds: input.durationSeconds,
    tags: normalizeTags(input.tags),
    uploadedAt: new Date().toISOString(),
    uploadedBy: "Anda",
    metadata: null,
  };

  getMockDb().assets.push(asset);
  return actionSuccess(asset);
}

/** Updates an asset's tags in place in the shared store. */
export async function updateAssetTagsAction(assetId: string, tags: string[]): Promise<ActionResult<AssetRecord>> {
  await delay(120);

  const asset = getMockDb().assets.find((a) => a.id === assetId);
  if (!asset) {
    return actionError("Asset not found");
  }

  asset.tags = normalizeTags(tags);
  return actionSuccess(asset);
}

/** Removes an asset from the shared store. */
export async function deleteAssetAction(assetId: string): Promise<ActionResult<undefined>> {
  await delay(120);

  const db = getMockDb();
  const index = db.assets.findIndex((a) => a.id === assetId);
  if (index === -1) {
    return actionError("Asset not found");
  }

  db.assets.splice(index, 1);
  return actionSuccess(undefined);
}

export interface AssetLibraryStats {
  totalAssets: number;
  byType: Record<AssetType, number>;
  byBrand: Record<ContentFocus, number>;
}

/**
 * Category/brand breakdown for the stat tiles above the asset grid.
 * Brand is inferred by checking whether one of the literal ContentFocus
 * tag values ("general" | "leasehold_sales" | "occupancy" | "beauty")
 * is present among an asset's tags -- this matches how the shared
 * mock-db seed data actually tags its assets. Assets with none of those
 * literal tags are not counted in `byBrand` (only in `byType`).
 */
export async function getAssetLibraryStatsAction(): Promise<AssetLibraryStats> {
  await delay(100);

  const assets = getMockDb().assets;

  const byType = ASSET_TYPES.reduce(
    (acc, type) => {
      acc[type] = 0;
      return acc;
    },
    {} as Record<AssetType, number>,
  );

  const byBrand = CONTENT_FOCUS_VALUES.reduce(
    (acc, brand) => {
      acc[brand] = 0;
      return acc;
    },
    {} as Record<ContentFocus, number>,
  );

  const brandTagValues: readonly string[] = CONTENT_FOCUS_VALUES;

  for (const asset of assets) {
    byType[asset.type] += 1;
    const brandTag = asset.tags.find((tag) => brandTagValues.includes(tag)) as ContentFocus | undefined;
    if (brandTag) {
      byBrand[brandTag] += 1;
    }
  }

  return { totalAssets: assets.length, byType, byBrand };
}
