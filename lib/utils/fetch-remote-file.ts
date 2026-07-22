import "server-only";

/**
 * Fetches a public URL and returns its bytes as base64 -- the same
 * fetch-URL/ArrayBuffer/Buffer/base64 primitive lib/meta/ads.ts's
 * uploadAdImageFromUrl uses for uploading a photo to Meta, pulled out here
 * so lib/ai/domains/markom.ts can reuse it to feed an uploaded content
 * photo into Gemini's vision input without duplicating the fetch/timeout
 * boilerplate.
 */
export async function fetchUrlAsBase64(url: string, headers?: Record<string, string>, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, headers });
  } catch (err) {
    throw new Error(
      err instanceof Error && err.name === "AbortError"
        ? `Gagal mengambil file (${url}): tidak merespon dalam ${timeoutMs}ms`
        : `Gagal mengambil file (${url}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Failed to fetch file (${url}): HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}
