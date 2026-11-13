import { afterEach, describe, expect, it, vi } from "vitest";

const generateAIText = vi.fn();
vi.mock("@/lib/ai/service", () => ({ generateAIText: (...args: unknown[]) => generateAIText(...args) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { AI_CONFIG } from "@/lib/ai/config";
import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeTransferProof } from "@/lib/ai/domains/transfer-proof-recognition";

const GOOD = JSON.stringify({ readable: true, nominal: 8922000, tanggal: "13 November 2026", waktu: "17:18", referensi: null, rekeningTujuan: "SARNO MANDIRI 1850 0066 1464 5", notes: "ok" });

afterEach(() => {
  generateAIText.mockReset();
  vi.unstubAllGlobals();
});

describe("recognizeTransferProof model choice", () => {
  it("reads with the stronger transfer-proof model first, one attempt", async () => {
    generateAIText.mockResolvedValueOnce({ text: GOOD });
    const result = await recognizeTransferProof({ imageBase64: "photo-a", imageMimeType: "image/jpeg" });
    expect(result.nominal).toBe(8922000);
    expect(generateAIText).toHaveBeenCalledTimes(1);
    expect(generateAIText.mock.calls[0][0]).toMatchObject({ model: AI_CONFIG.geminiTransferProofModel, maxAttempts: 1 });
    expect(AI_CONFIG.geminiTransferProofModel).not.toBe(AI_CONFIG.geminiModel);
  });

  it("falls back to the default model when the stronger one fails", async () => {
    generateAIText.mockRejectedValueOnce(new Error("503 high demand")).mockResolvedValueOnce({ text: GOOD });
    const result = await recognizeTransferProof({ imageBase64: "photo-b", imageMimeType: "image/jpeg" });
    expect(result.nominal).toBe(8922000);
    expect(generateAIText).toHaveBeenCalledTimes(2);
    expect(generateAIText.mock.calls[1][0].model).toBeUndefined();
  });

  it("reads the same photo only once across matchers, but never keeps a failure", async () => {
    generateAIText.mockResolvedValueOnce({ text: GOOD });
    await recognizeTransferProof({ imageBase64: "photo-c", imageMimeType: "image/jpeg" });
    await recognizeTransferProof({ imageBase64: "photo-c", imageMimeType: "image/jpeg" });
    expect(generateAIText).toHaveBeenCalledTimes(1);

    generateAIText.mockReset();
    generateAIText.mockRejectedValue(new Error("down"));
    await expect(recognizeTransferProof({ imageBase64: "photo-d", imageMimeType: "image/jpeg" })).rejects.toThrow();
    generateAIText.mockReset();
    generateAIText.mockResolvedValueOnce({ text: GOOD });
    expect((await recognizeTransferProof({ imageBase64: "photo-d", imageMimeType: "image/jpeg" })).nominal).toBe(8922000);
  });
});

describe("fetchImageAsBase64 retry", () => {
  const ok = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });

  it("retries a media URL that is not ready yet", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("nope", { status: 404 })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchImageAsBase64("https://example.test/m.jpe", { retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.fetchError).toBeUndefined();
    expect(result?.mimeType).toBe("image/jpeg");
  });

  it("treats a 200 JSON error page as a failed download and gives up after the attempts", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{"error":"not found"}', { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchImageAsBase64("https://example.test/m.jpe", { retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result?.fetchError).toContain("content-type");
  });
});
