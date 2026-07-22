import "server-only";

import { JWT } from "google-auth-library";

/**
 * Server-only Google Drive client for Asset Library (KontenAI Sprint 1) --
 * uploads, downloads and deletes files in one shared Drive via a service
 * account, so every KontenAI asset lives in one place instead of scattered
 * across Supabase Storage buckets. Auth uses a JWT client (no interactive
 * OAuth flow possible for a service account), token cached in-module and
 * refreshed a minute before expiry.
 *
 * Required env vars (unset until the service account + Shared Drive/folder
 * exist -- isGoogleDriveConfigured() gates every caller so upload/read paths
 * fail with a clear message instead of a confusing auth error):
 * - GOOGLE_SERVICE_ACCOUNT_JSON: the full service account key file's JSON
 *   contents (client_email + private_key are read out of it), pasted as one
 *   env var exactly as downloaded from Google Cloud Console.
 * - GOOGLE_DRIVE_ROOT_FOLDER_ID: id of the shared folder/Shared Drive the
 *   service account has Content Manager (or Editor) access to -- service
 *   accounts have no storage quota of their own, so this must be a folder a
 *   human already shared with the service account's email, or a Shared Drive
 *   it was added to.
 */
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function parseServiceAccountJson(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(parseServiceAccountJson() && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
}

function requireRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) throw new Error("Google Drive belum dikonfigurasi -- set env var GOOGLE_SERVICE_ACCOUNT_JSON dan GOOGLE_DRIVE_ROOT_FOLDER_ID.");
  return id;
}

let cachedClient: JWT | null = null;

function getJwtClient(): JWT {
  if (cachedClient) return cachedClient;

  const serviceAccount = parseServiceAccountJson();
  if (!serviceAccount) {
    throw new Error("Google Drive belum dikonfigurasi -- set env var GOOGLE_SERVICE_ACCOUNT_JSON (isi file JSON service account lengkap, client_email + private_key harus ada).");
  }

  cachedClient = new JWT({ email: serviceAccount.client_email, key: serviceAccount.private_key.replace(/\\n/g, "\n"), scopes: [DRIVE_SCOPE] });
  return cachedClient;
}

async function getAccessToken(): Promise<string> {
  const client = getJwtClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Gagal mendapatkan access token Google Drive");
  return token;
}

/** Auth header for a Drive-sourced asset's raw bytes (alt=media) -- used by any consumer that needs to re-download an already-uploaded asset (Gemini Vision re-analysis, video keyframe extraction, Render Engine). */
export async function getDriveAuthHeader(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getAccessToken()}` };
}

export function driveMediaUrl(fileId: string): string {
  return `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`;
}

interface DriveFileRef {
  id: string;
  name: string;
}

/** Finds an existing child folder by exact name under `parentId`, or creates it -- so repeated uploads under the same company/project/campaign path reuse one folder tree instead of creating duplicates. */
async function ensureChildFolder(parentId: string, name: string): Promise<string> {
  const headers = await getDriveAuthHeader();
  const escapedName = name.replace(/'/g, "\\'");
  const query = `'${parentId}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const listUrl = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const listRes = await fetch(listUrl, { headers });
  if (!listRes.ok) throw new Error(`Gagal mencari folder Drive "${name}" (HTTP ${listRes.status})`);
  const listData = (await listRes.json()) as { files?: DriveFileRef[] };
  const existing = listData.files?.[0];
  if (existing) return existing.id;

  const createRes = await fetch(`${DRIVE_FILES_URL}?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!createRes.ok) throw new Error(`Gagal membuat folder Drive "${name}" (HTTP ${createRes.status})`);
  const created = (await createRes.json()) as DriveFileRef;
  return created.id;
}

/** Resolves nested folder segments (e.g. ["Leasehold","Yogyakarta-Residence","2026-07-22"]) under the configured root, creating any that don't exist yet. */
export async function ensureDriveFolderPath(segments: string[]): Promise<string> {
  let currentId = requireRootFolderId();
  for (const segment of segments) {
    if (!segment) continue;
    currentId = await ensureChildFolder(currentId, segment);
  }
  return currentId;
}

export interface UploadToDriveInput {
  folderId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface UploadToDriveResult {
  fileId: string;
  webViewLink: string;
}

/** Uploads one file via multipart (metadata + media in one request -- fine for the asset sizes Asset Library accepts, no need for resumable upload), then grants "anyone with the link can view" so the returned link works for in-app previews without embedding credentials. */
export async function uploadFileToDrive(input: UploadToDriveInput): Promise<UploadToDriveResult> {
  const headers = await getDriveAuthHeader();
  const boundary = `kontenai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: input.filename, parents: [input.folderId] });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
    input.buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, {
    method: "POST",
    headers: { ...headers, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => "");
    throw new Error(`Gagal mengunggah file ke Google Drive (HTTP ${uploadRes.status}): ${detail.slice(0, 300)}`);
  }
  const uploaded = (await uploadRes.json()) as { id: string; webViewLink?: string };

  const permissionRes = await fetch(`${DRIVE_FILES_URL}/${uploaded.id}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permissionRes.ok) {
    throw new Error(`File terunggah ke Drive tapi gagal mengatur akses publik (HTTP ${permissionRes.status})`);
  }

  return { fileId: uploaded.id, webViewLink: uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view` };
}

export async function deleteFileFromDrive(fileId: string): Promise<void> {
  const headers = await getDriveAuthHeader();
  const res = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: "DELETE", headers });
  if (!res.ok && res.status !== 404) throw new Error(`Gagal menghapus file Drive (HTTP ${res.status})`);
}
