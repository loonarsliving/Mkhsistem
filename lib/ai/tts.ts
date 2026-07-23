import "server-only";

import { GoogleGenAI } from "@google/genai";

const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const TTS_VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";

/** Gemini TTS's raw output format for every prebuilt voice -- 16-bit signed little-endian PCM, mono, 24kHz. */
export const GEMINI_TTS_PCM_SAMPLE_RATE = 24000;

/**
 * Synthesizes one scene's voiceOver script into raw PCM audio via Gemini TTS.
 * Returns null (never throws) on any failure -- render-job-processor falls
 * back to a silent track for that scene rather than failing the whole render
 * over one narration line.
 */
export async function synthesizeVoiceOver(text: string): Promise<Buffer | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[tts] GEMINI_API_KEY belum diset -- scene ini dirender tanpa voice over");
    return null;
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: TTS_MODEL,
      contents: [{ role: "user", parts: [{ text: trimmed }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
      },
    });

    const base64 = response.data;
    if (!base64) throw new Error("Gemini TTS tidak mengembalikan audio");
    return Buffer.from(base64, "base64");
  } catch (error) {
    console.error("[tts] Gagal sintesis voice over, fallback ke senyap:", error instanceof Error ? error.message : error);
    return null;
  }
}
