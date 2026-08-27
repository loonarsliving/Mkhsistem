import path from "node:path";

import Database from "better-sqlite3";

/**
 * Fast path used ONLY by scripts/render-worker.ts when it happens to be
 * running on the same Mac Mini as the `Filemanager` repo agent: reads that
 * agent's SQLite catalog directly (read-only) to map its numeric file id
 * straight to an absolute path on disk, skipping the network round trip
 * lib/kontenai/asset-source.ts's Filemanager delivery-link API would
 * otherwise take through the Cloudflare Tunnel -- pointless when both
 * processes are on the same machine.
 *
 * Deliberately kept OUT of lib/ -- nothing under app/ or features/ imports
 * this file, so `better-sqlite3` (a native addon) never gets pulled into
 * the Next.js/Vercel bundle. If FILEMANAGER_DB_PATH/FILEMANAGER_STORAGE_ROOT
 * aren't set (e.g. this worker is running somewhere other than the Mac
 * Mini), every function here returns null and the caller falls back to
 * lib/kontenai/asset-source.ts's network path.
 */

let cachedDb: Database.Database | null | undefined;

function getReadonlyFilemanagerDb(): Database.Database | null {
  if (cachedDb !== undefined) return cachedDb;

  const dbPath = process.env.FILEMANAGER_DB_PATH;
  if (!dbPath) {
    cachedDb = null;
    return cachedDb;
  }

  try {
    cachedDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    console.warn(`[local-mac-asset-resolver] failed to open Filemanager DB at ${dbPath}, falling back to network resolution:`, err);
    cachedDb = null;
  }
  return cachedDb;
}

const lookupStmt = () => getReadonlyFilemanagerDb()?.prepare("SELECT relative_path FROM files WHERE id = ? AND is_deleted = 0");

/**
 * Resolves a local_mac asset's Filemanager file id (kontenai_assets.storage_path)
 * to an absolute path under FILEMANAGER_STORAGE_ROOT -- null if this worker
 * isn't configured to read the Filemanager DB locally (caller should fall
 * back to the network path) or the file id doesn't resolve to a live row.
 */
export function resolveLocalMacAssetPath(filemanagerFileId: string): string | null {
  const storageRoot = process.env.FILEMANAGER_STORAGE_ROOT;
  const stmt = lookupStmt();
  if (!storageRoot || !stmt) return null;

  const id = Number(filemanagerFileId);
  if (!Number.isFinite(id)) return null;

  const row = stmt.get(id) as { relative_path: string } | undefined;
  if (!row) return null;

  return path.join(storageRoot, ...row.relative_path.split("/"));
}
