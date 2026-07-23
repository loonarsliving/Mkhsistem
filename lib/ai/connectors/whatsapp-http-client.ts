/** Base URL for the WhatsApp Cloud API (Meta Graph API). */
export const WHATSAPP_GRAPH_API_BASE_URL = "https://app.whacenter.com/api";

export interface WhatsAppHttpResponse {
  status: number;
  ok: boolean;
  json: unknown;
}

/**
 * The minimal HTTP surface WhatsAppConnector needs — kept as a narrow
 * interface (not `fetch` directly) so tests can inject a fake client instead
 * of hitting the real Graph API, mirroring GeminiClientLike's pattern.
 * Ported verbatim from Aiagent (packages/integrations/src/connectors/whatsapp-http-client.ts).
 */
export interface WhatsAppHttpClient {
  get(path: string): Promise<WhatsAppHttpResponse>;
  post(path: string, body: unknown): Promise<WhatsAppHttpResponse>;
}

const REQUEST_TIMEOUT_MS = 15_000;

/** Real Graph API implementation — Bearer-token auth, JSON in/out, hard timeout. */
export function createFetchWhatsAppHttpClient(accessToken: string, baseUrl: string = WHATSAPP_GRAPH_API_BASE_URL): WhatsAppHttpClient {
  async function request(method: "GET" | "POST", path: string, body?: unknown): Promise<WhatsAppHttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
  method,
  headers: {
    "Content-Type": "application/json"
  },
  body: body ? JSON.stringify(body) : undefined,
  signal: controller.signal,
});
      const json = await response.json().catch(() => null);
      return { status: response.status, ok: response.ok, json };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
  };
}
