import "server-only";

import { GoogleGenAI } from "@google/genai";

/**
 * Veo image-to-video client -- used only by scripts/veo-worker.ts (never a
 * Vercel Server Action: a single generation routinely takes several
 * minutes, polled to completion here, far past any serverless function's
 * duration budget). Separate from lib/ai/service.ts's text-generation
 * entrypoint on purpose -- Veo isn't a text call and doesn't fit
 * gemini-retry.ts's model, and this uses its own API key/subscription
 * (VEO_API_KEY), independent from GEMINI_API_KEY.
 */
const DEFAULT_MODEL = "veo-2.0-generate-001";
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 60;

export function isVeoConfigured(): boolean {
  return Boolean(process.env.VEO_API_KEY);
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.VEO_API_KEY;
  if (!apiKey) throw new Error("Veo belum dikonfigurasi -- set env var VEO_API_KEY.");
  return new GoogleGenAI({ apiKey });
}

export interface GenerateVideoFromImageInput {
  prompt: string;
  imageBase64: string;
  imageMimeType: string;
  /** Local file path the generated mp4 is downloaded to. */
  downloadPath: string;
}

/**
 * Animates one still image into a short video clip matching `prompt` --
 * takes an existing (possibly only loosely matching) Asset Library photo
 * and a storyboard scene's brief, producing footage for scenes Asset
 * Selector couldn't find a good real match for. Polls the long-running
 * operation every 10s for up to ~10 minutes before giving up.
 */
export async function generateVideoFromImage(input: GenerateVideoFromImageInput): Promise<void> {
  const ai = getClient();
  const model = process.env.VEO_MODEL || DEFAULT_MODEL;

  let operation = await ai.models.generateVideos({
    model,
    prompt: input.prompt,
    image: { imageBytes: input.imageBase64, mimeType: input.imageMimeType },
    config: { numberOfVideos: 1 },
  });

  let attempts = 0;
  while (!operation.done) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error(`Veo tidak selesai dalam ~${Math.round((MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60000)} menit`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    operation = await ai.operations.getVideosOperation({ operation });
    attempts += 1;
  }

  const generated = operation.response?.generatedVideos?.[0];
  if (!generated?.video) throw new Error("Veo tidak menghasilkan video -- kemungkinan diblokir kebijakan konten atau prompt tidak valid");

  await ai.files.download({ file: generated.video, downloadPath: input.downloadPath });
}
