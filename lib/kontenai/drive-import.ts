import "server-only";

import type { ContentFocus } from "@/features/kontenai/types";
import { driveWebViewLink, getDriveRootFolderId, isGoogleDriveConfigured, listDriveFolderChildren } from "@/lib/google-drive/client";
import { createKontenAiAsset, type KontenAiAssetType } from "@/repositories/kontenai-assets.repository";
import type { TypedSupabaseClient } from "@/lib/supabase/types";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/**
 * Drive folder name -> ContentFocus brand slug. Must match the brand-first
 * tree under the "KontenAI" Drive folder (Leasehold / Villa-Occupancy /
 * Beauty, each holding content-type folders, each holding Foto/Vidio) --
 * this map is what turns "which folder was this file dragged into" into the
 * `company` value Asset Selector hard-filters on, so a brand only ever
 * exists in Drive as a folder, not as free text a human can mistype.
 */
const BRAND_FOLDER_MAP: Record<string, ContentFocus> = {
  Leasehold: "leasehold_sales",
  "Villa-Occupancy": "occupancy",
  Beauty: "beauty",
};

function slugifyContentType(folderName: string): string {
  return folderName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function inferAssetType(mimeType: string): KontenAiAssetType | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "").trim() || filename;
}

export interface DriveImportSummary {
  imported: number;
  skipped: number;
  skippedUnsupportedType: number;
  errors: string[];
}

/**
 * Walks KontenAI/{Brand}/{ContentType}/{Foto,Vidio}/* on Drive and turns
 * every image/video not already in the Asset Library into a kontenai_assets
 * row -- company and content_type come from the folder path itself, never
 * typed by hand, so footage dropped into e.g. KontenAI/Beauty/Ingredient
 * always lands as company='beauty', content_type='ingredient'. Files stay
 * on Drive (storage_path = the Drive file id); this only mirrors metadata
 * into the DB so Asset Selector's brand hard-filter and Gemini Vision have
 * something to query. Safe to re-run -- existing storage_path values are
 * skipped, so only newly-added footage gets imported each time.
 */
export async function importKontenAiAssetsFromDrive(supabase: TypedSupabaseClient, createdBy: string): Promise<DriveImportSummary> {
  if (!isGoogleDriveConfigured()) {
    throw new Error("Google Drive belum dikonfigurasi -- set GOOGLE_SERVICE_ACCOUNT_JSON dan GOOGLE_DRIVE_ROOT_FOLDER_ID.");
  }

  const summary: DriveImportSummary = { imported: 0, skipped: 0, skippedUnsupportedType: 0, errors: [] };

  const { data: existingRows, error: existingError } = await supabase
    .from("kontenai_assets")
    .select("storage_path")
    .eq("storage_provider", "google_drive")
    .is("deleted_at", null);
  if (existingError) throw existingError;
  const alreadyImported = new Set((existingRows ?? []).map((row) => row.storage_path));

  const rootId = getDriveRootFolderId();
  const brandFolders = (await listDriveFolderChildren(rootId)).filter((child) => child.mimeType === FOLDER_MIME_TYPE && child.name in BRAND_FOLDER_MAP);

  for (const brandFolder of brandFolders) {
    const company = BRAND_FOLDER_MAP[brandFolder.name];
    let contentTypeFolders: Awaited<ReturnType<typeof listDriveFolderChildren>>;
    try {
      contentTypeFolders = (await listDriveFolderChildren(brandFolder.id)).filter((child) => child.mimeType === FOLDER_MIME_TYPE);
    } catch (error) {
      summary.errors.push(`${brandFolder.name}: ${error instanceof Error ? error.message : "gagal membaca folder"}`);
      continue;
    }

    for (const contentTypeFolder of contentTypeFolders) {
      const contentType = slugifyContentType(contentTypeFolder.name);
      let mediaSubfolders: Awaited<ReturnType<typeof listDriveFolderChildren>>;
      try {
        mediaSubfolders = (await listDriveFolderChildren(contentTypeFolder.id)).filter((child) => child.mimeType === FOLDER_MIME_TYPE);
      } catch (error) {
        summary.errors.push(`${brandFolder.name}/${contentTypeFolder.name}: ${error instanceof Error ? error.message : "gagal membaca folder"}`);
        continue;
      }
      // Foto/Vidio subfolders when present (the standard KontenAI tree); falls back to files
      // directly inside the content-type folder for any manually-added shortcut structure.
      const leafFolders = mediaSubfolders.length > 0 ? mediaSubfolders : [contentTypeFolder];

      for (const leafFolder of leafFolders) {
        let files: Awaited<ReturnType<typeof listDriveFolderChildren>>;
        try {
          files = (await listDriveFolderChildren(leafFolder.id)).filter((child) => child.mimeType !== FOLDER_MIME_TYPE);
        } catch (error) {
          summary.errors.push(`${brandFolder.name}/${contentTypeFolder.name}/${leafFolder.name}: ${error instanceof Error ? error.message : "gagal membaca folder"}`);
          continue;
        }

        for (const file of files) {
          if (alreadyImported.has(file.id)) {
            summary.skipped += 1;
            continue;
          }
          const assetType = inferAssetType(file.mimeType);
          if (!assetType) {
            summary.skippedUnsupportedType += 1;
            continue;
          }

          try {
            await createKontenAiAsset(supabase, {
              title: titleFromFilename(file.name),
              description: null,
              filename: file.name,
              asset_type: assetType,
              storage_path: file.id,
              storage_provider: "google_drive",
              public_url: driveWebViewLink(file.id),
              file_type: file.mimeType,
              file_size_bytes: file.size ? Number(file.size) : 0,
              resolution: null,
              duration_seconds: null,
              company,
              project: null,
              campaign: null,
              platform: null,
              content_type: contentType,
              location: null,
              tags: [],
              created_by: createdBy,
            });
            alreadyImported.add(file.id);
            summary.imported += 1;
          } catch (error) {
            summary.errors.push(`${file.name}: ${error instanceof Error ? error.message : "gagal menyimpan"}`);
          }
        }
      }
    }
  }

  return summary;
}
