import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah AI storyboard artist untuk MK Connect, mengubah Creative Brief menjadi storyboard scene-by-scene yang siap diproduksi untuk konten video marketing bisnis leasehold properti, villa/occupancy, dan beauty. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface StoryboardSceneDraft {
  sceneTitle: string;
  visualDescription: string;
  cameraAngle: string;
  shotType: string;
  motion: string;
  voiceOver: string;
  onScreenText: string;
  durationSeconds: number;
}

export interface GenerateStoryboardInput {
  platform: string;
  objective: string;
  bigIdea: string;
  hook: string;
  keyMessage: string;
  targetEmotion: string;
  cta: string;
  contentAngle: string;
}

const MIN_SCENES = 3;
const MAX_SCENES = 8;

function asText(value: unknown, maxChars: number): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxChars) : "";
}

function asDuration(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 4;
  return Math.min(Math.max(Math.round(num), 1), 60);
}

function parseStoryboardJson(text: string): StoryboardSceneDraft[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons Storyboard Engine bukan JSON yang valid");
  }

  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  if (rawScenes.length === 0) {
    throw new Error("Respons Storyboard Engine tidak menyertakan scene apa pun");
  }

  const scenes: StoryboardSceneDraft[] = rawScenes
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      sceneTitle: asText(item.sceneTitle, 80) || "Scene",
      visualDescription: asText(item.visualDescription, 500),
      cameraAngle: asText(item.cameraAngle, 60),
      shotType: asText(item.shotType, 60),
      motion: asText(item.motion, 60),
      voiceOver: asText(item.voiceOver, 400),
      onScreenText: asText(item.onScreenText, 120),
      durationSeconds: asDuration(item.durationSeconds),
    }))
    .filter((scene) => scene.visualDescription.length > 0)
    .slice(0, MAX_SCENES);

  if (scenes.length < MIN_SCENES) {
    throw new Error(`Respons Storyboard Engine hanya menghasilkan ${scenes.length} scene valid (minimal ${MIN_SCENES})`);
  }

  return scenes;
}

/**
 * Turns a Creative Brief (AI Director, Sprint 3) into a concrete
 * scene-by-scene storyboard -- the "AI otomatis membuat storyboard" step.
 * Each scene carries everything a shoot/edit team needs: title, visual
 * description, camera angle, shot type, motion, voice over, on-screen text,
 * and duration.
 */
export async function generateStoryboardFromBrief(input: GenerateStoryboardInput): Promise<StoryboardSceneDraft[]> {
  const userPrompt = `Susun storyboard scene-by-scene (minimal ${MIN_SCENES}, maksimal ${MAX_SCENES} scene) berdasarkan Creative Brief berikut untuk platform ${input.platform} dengan objective ${input.objective}:

- Big Idea: ${input.bigIdea}
- Hook: ${input.hook}
- Key Message: ${input.keyMessage}
- Target Emotion: ${input.targetEmotion}
- CTA: ${input.cta}
- Content Angle: ${input.contentAngle}

Urutan storyboard harus mengikuti alur: scene pembuka yang mewujudkan Hook, beberapa scene isi yang menyampaikan Key Message & Big Idea sesuai Content Angle, dan scene penutup yang mewujudkan CTA. Setiap scene WAJIB mengisi:
- sceneTitle: judul singkat scene (maks 8 kata)
- visualDescription: deskripsi visual konkret apa yang terlihat di scene (subjek, aksi, setting)
- cameraAngle: sudut kamera (contoh: Eye Level, Low Angle, High Angle, Overhead, Dutch Angle)
- shotType: jenis shot (contoh: Close-up, Medium Shot, Wide Shot, Establishing Shot, Extreme Close-up)
- motion: gerakan kamera/subjek (contoh: Static, Pan Kanan, Zoom In, Tracking Shot, Handheld Follow)
- voiceOver: narasi/voice over untuk scene ini (boleh kosong jika scene murni visual)
- onScreenText: teks yang tampil di layar untuk scene ini (boleh kosong)
- durationSeconds: estimasi durasi scene dalam detik (angka, 2-10 detik per scene)

Balas HANYA dengan JSON object:
{"scenes": [{"sceneTitle": "...", "visualDescription": "...", "cameraAngle": "...", "shotType": "...", "motion": "...", "voiceOver": "...", "onScreenText": "...", "durationSeconds": 4}, ...]}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 2048,
  });

  return parseStoryboardJson(response.text);
}
