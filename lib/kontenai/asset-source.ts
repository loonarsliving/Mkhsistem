import "server-only";

import { driveMediaUrl, getDriveAuthHeader } from "@/lib/google-drive/client";
import { getFilemanagerDeliverLink } from "@/lib/filemanager/client";

/**
 * Resolves how to re-download an already-persisted KontenAI asset's raw
 * bytes for server-side processing (Gemini Vision, video keyframe
 * extraction, Render Engine) -- Drive-backed assets need an authenticated
 * `alt=media` request (the public webViewLink shows an HTML viewer, not raw
 * bytes, and large files trigger Drive's virus-scan interstitial on
 * anonymous links), pre-existing Supabase-backed assets are read the same
 * way they always were, as a plain public URL fetch, and local_mac-backed
 * assets (footage physically stored on the owner's Mac Mini, migration
 * 0246) go through the separate `Filemanager` repo agent's short-lived
 * delivery-link API over its Cloudflare Tunnel -- storage_path is that
 * agent's own numeric file id, not a filesystem path.
 *
 * This function is safe to call from BOTH Vercel (e.g.
 * gemini-vision.actions.ts) and the render worker when it happens to run
 * off the Mac Mini -- it never touches the local filesystem itself.
 * scripts/render-worker.ts has its own faster, network-free path for when
 * it's actually running ON the Mac Mini (see local-mac-asset-resolver.ts);
 * this remains the correct fallback either way.
 */
export interface AssetDownloadSource {
  url: string;
  headers: Record<string, string>;
}

export async function resolveAssetDownloadSource(asset: {
  storage_provider?: string | null;
  storage_path: string;
  public_url: string | null;
}): Promise<AssetDownloadSource> {
  if (asset.storage_provider === "google_drive") {
    return { url: driveMediaUrl(asset.storage_path), headers: await getDriveAuthHeader() };
  }
  if (asset.storage_provider === "local_mac") {
    const fileId = Number(asset.storage_path);
    if (!Number.isFinite(fileId)) {
      throw new Error(`local_mac asset has a non-numeric storage_path (expected a Filemanager file id): "${asset.storage_path}"`);
    }
    const { url } = await getFilemanagerDeliverLink(fileId);
    return { url, headers: {} };
  }
  if (!asset.public_url) {
    throw new Error(`asset has no public_url and storage_provider is not google_drive/local_mac (got "${asset.storage_provider ?? "supabase"}")`);
  }
  return { url: asset.public_url, headers: {} };
}
