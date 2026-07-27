import "server-only";

import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

const FFMPEG_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Where ffmpeg actually is, resolved on first use rather than at import time.
 *
 * @ffmpeg-installer/ffmpeg ships a per-platform binary in an optional
 * dependency, and importing it evaluates that lookup immediately. On hosts
 * that carry the binary (the Railway worker image) that is fine; in the
 * Vercel route-handler bundle the optional package is not traced in, so a
 * static import threw "Cannot find module '@ffmpeg-installer/linux-x64/
 * package.json'" at module load -- which took down the whole route, not just
 * video analysis. Resolving lazily keeps that failure local to the one call
 * that needs a frame, and lets a system ffmpeg on PATH stand in.
 *
 * null means "looked and found nothing" -- distinct from undefined
 * ("haven't looked yet"), so the lookup is attempted exactly once.
 */
let cachedFfmpegPath: string | null | undefined;

async function resolveFfmpegPath(): Promise<string | null> {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;

  try {
    const installer = (await import("@ffmpeg-installer/ffmpeg")) as { default?: { path?: string }; path?: string };
    const path = installer.default?.path ?? installer.path;
    if (path) {
      cachedFfmpegPath = path;
      return cachedFfmpegPath;
    }
  } catch {
    // Falls through to the PATH lookup below.
  }

  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5_000 });
    cachedFfmpegPath = "ffmpeg";
  } catch {
    cachedFfmpegPath = null;
    logger.warn("ffmpeg is unavailable in this runtime -- video keyframe extraction will be skipped", {
      hint: "@ffmpeg-installer/ffmpeg is not resolvable and no ffmpeg is on PATH",
    });
  }

  return cachedFfmpegPath;
}

/** Hard cap on how much video this will download+process -- extraction runs inside a single serverless invocation (see maxDuration on the calling action), so very large files are rejected up front with a clear message instead of timing out silently. */
export const MAX_VIDEO_ANALYSIS_SIZE_BYTES = 100 * 1024 * 1024;

export interface VideoKeyframe {
  timestampSeconds: number;
  base64: string;
  mimeType: string;
}

/**
 * Picks up to `maxFrames` timestamps spread across the video, roughly
 * `minIntervalSeconds` apart for short videos, gracefully sampling evenly
 * across the whole duration for longer ones instead of only covering the
 * first few frames. Each timestamp is the midpoint of its slice, and never
 * within half a second of the very end (seeking exactly at/after EOF often
 * fails to decode a frame).
 */
export function computeKeyframeTimestamps(durationSeconds: number, maxFrames = 8, minIntervalSeconds = 5): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 1) return [0.5];

  const naturalCount = Math.floor(durationSeconds / minIntervalSeconds) + 1;
  const count = Math.max(1, Math.min(maxFrames, naturalCount));
  const step = durationSeconds / count;

  return Array.from({ length: count }, (_, i) => Math.min(durationSeconds - 0.5, Math.round((i * step + step / 2) * 10) / 10));
}

async function downloadVideoToTemp(url: string, headers: Record<string, string>, destPath: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok || !response.body) {
      throw new Error(`Gagal mengunduh video (HTTP ${response.status})`);
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_VIDEO_ANALYSIS_SIZE_BYTES) {
      throw new Error(`Ukuran video (${Math.round(contentLength / (1024 * 1024))}MB) melebihi batas analisis ${Math.round(MAX_VIDEO_ANALYSIS_SIZE_BYTES / (1024 * 1024))}MB`);
    }
    await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), createWriteStream(destPath));
  } catch (err) {
    throw err instanceof Error && err.name === "AbortError" ? new Error(`Unduhan video timeout setelah ${DOWNLOAD_TIMEOUT_MS}ms`) : err;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractSingleFrame(ffmpegPath: string, videoPath: string, timestampSeconds: number, outputPath: string): Promise<void> {
  await execFileAsync(
    ffmpegPath,
    [
      "-ss", String(timestampSeconds),
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "3",
      "-vf", "scale='min(1024,iw)':-2",
      "-y",
      outputPath,
    ],
    { timeout: FFMPEG_TIMEOUT_MS },
  );
}

/**
 * Downloads the video once to a temp file, then extracts up to `maxFrames`
 * JPEG keyframes via ffmpeg (@ffmpeg-installer/ffmpeg's bundled static
 * binary, or a system ffmpeg) -- one per computed timestamp. A single failed
 * seek/decode doesn't abort the batch (Promise.allSettled), so a partially
 * corrupt or unusually short video still yields whatever frames succeeded.
 * Always cleans up the temp directory, success or failure.
 *
 * Returns an empty array when this runtime has no ffmpeg at all, rather than
 * throwing: callers already treat "no frames" as "analyze from filename and
 * context instead" (see analyzeVideoAsset), so a host without the binary
 * degrades to weaker metadata instead of failing the asset outright.
 */
export async function extractVideoKeyframes(
  videoUrl: string,
  durationSeconds: number | null,
  options?: { maxFrames?: number; minIntervalSeconds?: number; headers?: Record<string, string> },
): Promise<VideoKeyframe[]> {
  const ffmpegPath = await resolveFfmpegPath();
  if (!ffmpegPath) return [];

  const timestamps = computeKeyframeTimestamps(durationSeconds ?? 20, options?.maxFrames ?? 8, options?.minIntervalSeconds ?? 5);

  const workDir = await mkdtemp(join(tmpdir(), "kontenai-video-"));
  const videoPath = join(workDir, "source.mp4");

  try {
    await downloadVideoToTemp(videoUrl, options?.headers ?? {}, videoPath);

    const results = await Promise.allSettled(
      timestamps.map(async (timestampSeconds, index) => {
        const framePath = join(workDir, `frame-${index}.jpg`);
        await extractSingleFrame(ffmpegPath, videoPath, timestampSeconds, framePath);
        const buffer = await readFile(framePath);
        return { timestampSeconds, base64: buffer.toString("base64"), mimeType: "image/jpeg" } satisfies VideoKeyframe;
      }),
    );

    return results.filter((r): r is PromiseFulfilledResult<VideoKeyframe> => r.status === "fulfilled").map((r) => r.value);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
