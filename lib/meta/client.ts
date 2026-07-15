import "server-only";

import { META_CONFIG, isMetaConfigured } from "./config";

const GRAPH_BASE = "https://graph.facebook.com";

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly graphError?: unknown,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

/** Thin Graph API wrapper -- every Meta call in this module goes through here so auth, error shape, and API version stay in one place. */
export async function metaGraphRequest<T>(path: string, params: Record<string, unknown> = {}, method: "GET" | "POST" | "DELETE" = "GET"): Promise<T> {
  if (!isMetaConfigured()) {
    throw new MetaApiError("Meta integration is not configured (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID/META_PAGE_ID)", 0);
  }

  const url = new URL(`${GRAPH_BASE}/${META_CONFIG.apiVersion}${path}`);
  const body = new URLSearchParams();
  body.set("access_token", META_CONFIG.accessToken);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  const init: RequestInit =
    method === "GET"
      ? { method: "GET" }
      : { method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body };
  if (method === "GET") {
    url.search = body.toString();
  }

  const response = await fetch(url.toString(), init);
  const json = (await response.json().catch(() => null)) as (T & GraphErrorBody) | null;

  if (!response.ok || json?.error) {
    const message = json?.error?.message ?? `HTTP ${response.status}`;
    throw new MetaApiError(`Meta Graph API error: ${message}`, response.status, json?.error);
  }

  return json as T;
}

interface CachedMetaHealthCheck {
  result: { ok: boolean; detail: string };
  cachedAt: number;
}

let cachedMetaHealthCheck: CachedMetaHealthCheck | null = null;
const META_HEALTHCHECK_CACHE_MS = 300_000;

/** Mirrors lib/ai/service.ts's aiHealthCheck() / whatsAppHealthCheck() caching -- successful result reused for 5 minutes, failures never cached. */
export async function metaHealthCheck(): Promise<{ ok: boolean; detail: string; configured: boolean }> {
  if (!isMetaConfigured()) {
    return { ok: false, detail: "META_ACCESS_TOKEN/META_AD_ACCOUNT_ID/META_PAGE_ID belum diatur", configured: false };
  }

  if (cachedMetaHealthCheck && Date.now() - cachedMetaHealthCheck.cachedAt < META_HEALTHCHECK_CACHE_MS) {
    return { ...cachedMetaHealthCheck.result, detail: `${cachedMetaHealthCheck.result.detail} (cached)`, configured: true };
  }

  try {
    const account = await metaGraphRequest<{ id: string; name: string; account_status: number }>(`/${META_CONFIG.adAccountId}`, {
      fields: "id,name,account_status",
    });
    const ok = account.account_status === 1;
    const result = {
      ok,
      detail: ok
        ? `Terhubung ke Ad Account "${account.name}"`
        : `Ad Account "${account.name}" ditemukan tapi tidak aktif (account_status=${account.account_status})`,
    };
    if (ok) cachedMetaHealthCheck = { result, cachedAt: Date.now() };
    return { ...result, configured: true };
  } catch (err) {
    const detail = err instanceof MetaApiError ? err.message : "Gagal terhubung ke Meta Graph API";
    return { ok: false, detail, configured: true };
  }
}
