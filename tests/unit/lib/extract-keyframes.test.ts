import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_VERCEL = process.env.VERCEL;

afterEach(() => {
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("extractVideoKeyframes", () => {
  it("skips ffmpeg on Vercel and never downloads the video", async () => {
    // next.config.ts excludes the ffmpeg binary from every Vercel bundle, so
    // there the lookup must short-circuit to the no-frames fallback.
    process.env.VERCEL = "1";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { extractVideoKeyframes } = await import("@/lib/video/extract-keyframes");

    await expect(extractVideoKeyframes("https://example.com/video.mp4", 30)).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("computeKeyframeTimestamps", () => {
  it("spreads frames across the video and stays clear of the end", async () => {
    const { computeKeyframeTimestamps } = await import("@/lib/video/extract-keyframes");
    const ts = computeKeyframeTimestamps(60, 8, 5);
    expect(ts).toHaveLength(8);
    expect(Math.max(...ts)).toBeLessThanOrEqual(59.5);
    expect(computeKeyframeTimestamps(0.5)).toEqual([0.5]);
  });
});
