import "server-only";

/**
 * Client for the owner's Mac Mini file-manager agent (separate
 * `Filemanager` repo), reached through a Cloudflare Tunnel at
 * FILEMANAGER_BASE_URL. This app is the caller here — Filemanager never
 * calls back into MK Connect, so this is the only integration point.
 *
 * Filemanager holds the actual file bytes and its own SQLite catalog;
 * this app never persists either. See lib/ai/domains/file-request.ts for
 * the WhatsApp-facing flow that uses this client.
 */

function requireConfig(): { baseUrl: string; secret: string } {
  const baseUrl = (process.env.FILEMANAGER_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const secret = (process.env.FILEMANAGER_SHARED_SECRET ?? "").trim();
  if (!baseUrl || !secret) {
    throw new Error("Filemanager is not configured (FILEMANAGER_BASE_URL / FILEMANAGER_SHARED_SECRET)");
  }
  return { baseUrl, secret };
}

/** True without throwing -- callers that want to no-op rather than error when the feature isn't configured yet should check this first. */
export function isFilemanagerConfigured(): boolean {
  return Boolean((process.env.FILEMANAGER_BASE_URL ?? "").trim()) && Boolean((process.env.FILEMANAGER_SHARED_SECRET ?? "").trim());
}

export interface FilemanagerFileCandidate {
  id: number;
  displayName: string;
  categoryName: string | null;
}

export async function searchFilemanagerCatalog(query: string): Promise<FilemanagerFileCandidate[]> {
  const { baseUrl, secret } = requireConfig();
  const response = await fetch(`${baseUrl}/api/search`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mkh-secret": secret },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`Filemanager search failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { candidates: FilemanagerFileCandidate[] };
  return body.candidates;
}

export interface StoreFileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string | null;
  /** Breadcrumb of category names from root to leaf, e.g. ["Legal", "Kontrak"]. Empty for uncategorized. */
  categoryPath: string[];
  displayName?: string;
  description?: string;
}

export async function storeFileInFilemanager(input: StoreFileInput): Promise<{ fileId: number; relativePath: string }> {
  const { baseUrl, secret } = requireConfig();

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(input.buffer)], { type: input.mimeType ?? "application/octet-stream" }), input.filename);
  formData.append("categoryPath", JSON.stringify(input.categoryPath));
  if (input.displayName) formData.append("displayName", input.displayName);
  if (input.description) formData.append("description", input.description);

  const response = await fetch(`${baseUrl}/api/store`, {
    method: "POST",
    headers: { "x-mkh-secret": secret },
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Filemanager store failed: HTTP ${response.status} ${text}`);
  }
  return (await response.json()) as { fileId: number; relativePath: string };
}

/** Returns a short-lived, single-use public URL Filemanager will serve the file from (the tunnel makes this fetchable by Whacenter directly) -- this app never downloads or re-hosts the bytes itself. */
export async function getFilemanagerDeliverLink(fileId: number): Promise<{ url: string; filename: string }> {
  const { baseUrl, secret } = requireConfig();
  const response = await fetch(`${baseUrl}/api/deliver-link`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mkh-secret": secret },
    body: JSON.stringify({ fileId }),
  });
  if (!response.ok) {
    throw new Error(`Filemanager deliver-link failed: HTTP ${response.status}`);
  }
  return (await response.json()) as { url: string; filename: string };
}
