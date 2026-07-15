import "server-only";

import { saveIntegrationLog } from "../ai/integration-log";
import { META_CONFIG, isMetaConfigured } from "./config";

const GRAPH_BASE = "https://graph.facebook.com";
const REQUEST_TIMEOUT_MS = 20_000;

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
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string };
}

/** Meta's top-level error.message is often a generic bucket ("Invalid parameter"); error_user_msg/error_user_title (when present) name the actual offending field -- both get folded into the thrown message instead of only the generic one. */
function formatGraphErrorMessage(error: GraphErrorBody["error"], fallback: string): string {
  if (!error) return fallback;
  const parts = [error.message ?? fallback];
  if (error.error_user_title) parts.push(error.error_user_title);
  if (error.error_user_msg) parts.push(error.error_user_msg);
  if (error.error_subcode) parts.push(`subcode ${error.error_subcode}`);
  return parts.join(" -- ");
}

/** Thin Graph API wrapper -- every Meta call in this module goes through here so auth, error shape, and API version stay in one place. Every call (success or failure) is persisted to ai_integration_logs, mirroring the WhatsApp connector's telemetry, so a failure like "Invalid parameter" can be diagnosed from the actual request/response instead of just the terse thrown message. */
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

  // access_token excluded (credential); adimages' base64 `bytes` excluded too (can be megabytes, not useful for diagnosis) -- everything else is kept.
  const loggedParams = { ...params };
  delete loggedParams.access_token;
  if (typeof loggedParams.bytes === "string") loggedParams.bytes = `<${loggedParams.bytes.length} base64 chars omitted>`;
  const startedAt = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), { ...init, signal: controller.signal });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Meta Graph API tidak merespon dalam ${REQUEST_TIMEOUT_MS / 1000} detik (${path})`
        : `Gagal menghubungi Meta Graph API: ${err instanceof Error ? err.message : String(err)}`;
    await saveIntegrationLog({ connector: "meta", direction: "outgoing", payload: { path, method, params: loggedParams }, status: "error", error: message, latencyMs });
    clearTimeout(timeout);
    throw new MetaApiError(message, 0);
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Date.now() - startedAt;
  const json = (await response.json().catch(() => null)) as (T & GraphErrorBody) | null;

  if (!response.ok || json?.error) {
    const message = formatGraphErrorMessage(json?.error, `HTTP ${response.status}`);
    await saveIntegrationLog({
      connector: "meta",
      direction: "outgoing",
      payload: { path, method, params: loggedParams, graphError: json?.error },
      status: "error",
      responseStatus: response.status,
      error: message,
      latencyMs,
    });
    throw new MetaApiError(`Meta Graph API error: ${message}`, response.status, json?.error);
  }

  await saveIntegrationLog({ connector: "meta", direction: "outgoing", payload: { path, method, params: loggedParams }, status: "success", responseStatus: response.status, latencyMs });
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
    const missing = [
      META_CONFIG.accessToken.length === 0 && "META_ACCESS_TOKEN",
      META_CONFIG.adAccountId.length === 0 && "META_AD_ACCOUNT_ID",
      META_CONFIG.pageId.length === 0 && "META_PAGE_ID",
    ].filter((v): v is string => Boolean(v));
    return { ok: false, detail: `Belum diatur: ${missing.join(", ")}`, configured: false };
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
