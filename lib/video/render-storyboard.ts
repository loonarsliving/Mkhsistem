import "server-only";

import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { GEMINI_TTS_PCM_SAMPLE_RATE } from "../ai/tts";

const execFileAsync = promisify(execFile);

const FFMPEG_PATH = ffmpegInstaller.path;
const FFMPEG_SEGMENT_TIMEOUT_MS = 25_000;
const FFMPEG_MUX_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Per-asset download cap -- render runs inside a single serverless invocation, so oversized source assets are rejected up front instead of risking a timeout. */
export const MAX_RENDER_ASSET_SIZE_BYTES = 150 * 1024 * 1024;

const OUTPUT_FPS = 24;

/**
 * Output frame size by destination platform -- draft resolution (short side
 * 480px) keeps ultrafast-preset encode time low; a later sprint can offer
 * higher-res final renders. Instagram has no separate feed/reels signal in
 * the creative brief yet, so it defaults to the vertical short-form size
 * (Reels/Stories) alongside TikTok; Facebook keeps the classic landscape
 * frame. Falls back to landscape for an unrecognized/missing platform.
 */
const OUTPUT_DIMENSIONS_BY_PLATFORM: Record<string, { width: number; height: number }> = {
  tiktok: { width: 480, height: 854 },
  instagram: { width: 480, height: 854 },
  facebook: { width: 854, height: 480 },
};
const DEFAULT_OUTPUT_DIMENSIONS = OUTPUT_DIMENSIONS_BY_PLATFORM.facebook;

function resolveOutputDimensions(targetPlatform?: string | null): { width: number; height: number } {
  if (targetPlatform && targetPlatform in OUTPUT_DIMENSIONS_BY_PLATFORM) return OUTPUT_DIMENSIONS_BY_PLATFORM[targetPlatform];
  return DEFAULT_OUTPUT_DIMENSIONS;
}

/** Simple fade in/out per scene (Sprint 6 spec item 5) -- capped so it never eats more than a third of a very short scene. */
function fadeDuration(sceneDurationSeconds: number): number {
  return Math.min(0.4, sceneDurationSeconds / 3);
}

export interface RenderScene {
  assetUrl: string;
  /** Auth header needed to fetch assetUrl's raw bytes (Drive-backed assets); omit/empty for a plain public URL. */
  assetHeaders?: Record<string, string>;
  assetType: "image" | "video";
  durationSeconds: number;
  /** Raw PCM (16-bit LE, mono, 24kHz -- Gemini TTS's output format) narration for this scene; omitted/null renders the scene silent. */
  voiceOverPcm?: Buffer | null;
}

export interface RenderResult {
  /** Absolute path to the final rendered mp4 -- caller must read/upload it, then remove `workDir`. */
  outputPath: string;
  workDir: string;
}

async function downloadToTemp(url: string, headers: Record<string, string>, destPath: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok || !response.body) {
      throw new Error(`Gagal mengunduh aset (HTTP ${response.status})`);
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_RENDER_ASSET_SIZE_BYTES) {
      throw new Error(`Ukuran aset (${Math.round(contentLength / (1024 * 1024))}MB) melebihi batas render ${Math.round(MAX_RENDER_ASSET_SIZE_BYTES / (1024 * 1024))}MB`);
    }
    await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), createWriteStream(destPath));
  } catch (err) {
    throw err instanceof Error && err.name === "AbortError" ? new Error(`Unduhan aset timeout setelah ${DOWNLOAD_TIMEOUT_MS}ms`) : err;
  } finally {
    clearTimeout(timeout);
  }
}

function scaleFadeFilter(durationSeconds: number, dimensions: { width: number; height: number }): string {
  const fade = fadeDuration(durationSeconds);
  const fadeOutStart = Math.max(0, durationSeconds - fade);
  return [
    `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
    `pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `fps=${OUTPUT_FPS}`,
    `fade=t=in:st=0:d=${fade.toFixed(2)}`,
    `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fade.toFixed(2)}`,
  ].join(",");
}

/**
 * Builds one scene's segment -- image is looped as a still for its scene
 * duration, video is looped/trimmed to it -- both scaled/padded to a shared
 * frame size and codec so the concat demuxer can stitch them without
 * re-encoding again. Audio is either the scene's Gemini TTS narration (padded
 * with silence if shorter than the scene, trimmed if longer) or a silent
 * placeholder -- every segment always carries an AAC track so concat -c copy
 * never hits a stream mismatch between narrated and silent scenes.
 */
async function buildSceneSegment(scene: RenderScene, sourcePath: string, outputPath: string, workDir: string, index: number, dimensions: { width: number; height: number }): Promise<void> {
  const filter = scaleFadeFilter(scene.durationSeconds, dimensions);
  const inputArgs = scene.assetType === "image" ? ["-loop", "1", "-i", sourcePath] : ["-stream_loop", "-1", "-i", sourcePath];

  let audioInputArgs: string[];
  let audioFilter: string;
  if (scene.voiceOverPcm) {
    const pcmPath = join(workDir, `voiceover-${index}.pcm`);
    await writeFile(pcmPath, scene.voiceOverPcm);
    audioInputArgs = ["-f", "s16le", "-ar", String(GEMINI_TTS_PCM_SAMPLE_RATE), "-ac", "1", "-i", pcmPath];
    audioFilter = "apad"; // pad with silence if the narration is shorter than the scene; global -t below trims if longer
  } else {
    audioInputArgs = ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono"];
    audioFilter = "anull";
  }

  await execFileAsync(
    FFMPEG_PATH,
    [
      ...inputArgs,
      ...audioInputArgs,
      "-t", String(scene.durationSeconds),
      "-vf", filter,
      "-af", audioFilter,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", "44100", "-ac", "2",
      "-y", outputPath,
    ],
    { timeout: FFMPEG_SEGMENT_TIMEOUT_MS },
  );
}

async function concatSegments(segmentPaths: string[], workDir: string, outputPath: string): Promise<void> {
  const listPath = join(workDir, "concat-list.txt");
  const listContent = segmentPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, listContent, "utf8");

  await execFileAsync(FFMPEG_PATH, ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", outputPath], { timeout: FFMPEG_MUX_TIMEOUT_MS });
}

export interface RenderProgressReporter {
  (progress: number, stage: string): Promise<void>;
}

/**
 * Renders a storyboard's scenes (in order, each with its selected asset) into
 * one draft mp4: download every asset once, build one fixed-size/fixed-fps
 * segment per scene (looped/trimmed to that scene's duration, simple fade
 * in/out, its own narration or silent audio track), then concatenate them in
 * order. `targetPlatform` (the creative brief's destination platform) picks
 * the output aspect ratio -- vertical for TikTok/Instagram, landscape for
 * Facebook. Reports coarse, real (not simulated) progress via `onProgress` as
 * each stage actually completes, so a caller can persist it for polling.
 */
export async function renderStoryboardDraft(scenes: RenderScene[], targetPlatform?: string | null, onProgress?: RenderProgressReporter): Promise<RenderResult> {
  if (scenes.length === 0) throw new Error("Storyboard tidak memiliki scene untuk dirender");

  const dimensions = resolveOutputDimensions(targetPlatform);
  const workDir = await mkdtemp(join(tmpdir(), "kontenai-render-"));

  await onProgress?.(5, "Mengunduh aset");
  const sourcePaths = await Promise.all(
    scenes.map(async (scene, index) => {
      const ext = scene.assetType === "image" ? "img" : "mp4";
      const sourcePath = join(workDir, `source-${index}.${ext}`);
      await downloadToTemp(scene.assetUrl, scene.assetHeaders ?? {}, sourcePath);
      return sourcePath;
    }),
  );

  await onProgress?.(25, "Menyusun scene");
  const segmentPaths: string[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const segmentPath = join(workDir, `segment-${index}.mp4`);
    await buildSceneSegment(scenes[index], sourcePaths[index], segmentPath, workDir, index, dimensions);
    segmentPaths.push(segmentPath);
    await onProgress?.(25 + Math.round(((index + 1) / scenes.length) * 60), `Encoding scene ${index + 1}/${scenes.length}`);
  }

  await onProgress?.(90, "Menggabungkan scene");
  const outputPath = join(workDir, "output.mp4");
  await concatSegments(segmentPaths, workDir, outputPath);

  return { outputPath, workDir };
}

export async function readRenderedFile(path: string): Promise<Buffer> {
  return readFile(path);
}

export async function cleanupRenderWorkDir(workDir: string): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
}
