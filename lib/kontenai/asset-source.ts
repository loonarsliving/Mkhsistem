import "server-only";

import { driveMediaUrl, getDriveAuthHeader } from "@/lib/google-drive/client";

/**
 * Resolves how to re-download an already-persisted KontenAI asset's raw
 * bytes for server-side processing (Gemini Vision, video keyframe
 * extraction, Render Engine) -- Drive-backed assets need an authenticated
 * `alt=media` request (the public webViewLink shows an HTML viewer, not raw
 * bytes, and large files trigger Drive's virus-scan interstitial on
 * anonymous links), while pre-existing Supabase-backed assets are read the
 * same way they always were, as a plain public URL fetch.
 */
export interface AssetDownloadSource {
  url: string;
  headers: Record<string, string>;
}

export async function resolveAssetDownloadSource(asset: {
  storage_provider?: string | null;
  storage_path: string;
  public_url: string;
}): Promise<AssetDownloadSource> {
  if (asset.storage_provider === "google_drive") {
    return { url: driveMediaUrl(asset.storage_path), headers: await getDriveAuthHeader() };
  }
  return { url: asset.public_url, headers: {} };
}
