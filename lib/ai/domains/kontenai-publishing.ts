import "server-only";

import { generateAIText } from "@/lib/ai/service";
import type { PublishPlatform } from "@/lib/publishing/platform-adapters";

const SYSTEM_PROMPT =
  "Kamu adalah social media copywriter untuk MK Connect, menulis caption dan hashtag untuk konten marketing bisnis leasehold properti, villa/occupancy, dan beauty. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

const PLATFORM_GUIDANCE: Record<PublishPlatform, string> = {
  instagram: "Instagram: caption bisa 2-4 kalimat, boleh pakai emoji secukupnya, tutup dengan CTA yang jelas.",
  facebook: "Facebook: caption gaya percakapan, sedikit lebih panjang dan informatif, cocok untuk audiens yang lebih luas/umur beragam.",
  tiktok: "TikTok: caption singkat dan catchy (maks 1-2 kalimat), gaya santai/trend-aware, hook di kalimat pertama.",
  youtube_shorts: "YouTube Shorts: caption ringkas mirip judul video, jelas menyebutkan apa yang akan ditonton, hindari basa-basi panjang.",
};

export interface GeneratePublishingCopyInput {
  platform: PublishPlatform;
  productProject: string;
  bigIdea: string;
  hook: string;
  keyMessage: string;
  targetEmotion: string;
  cta: string;
  contentAngle: string;
}

export interface PublishingCopyResult {
  caption: string;
  hashtags: string[];
}

function asText(value: unknown, maxChars: number): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxChars) : "";
}

function asHashtags(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => {
      const clean = item.trim().replace(/\s+/g, "").replace(/^#*/, "");
      return `#${clean}`;
    })
    .filter((tag) => tag.length > 1)
    .slice(0, maxItems);
}

function parsePublishingCopyJson(text: string): PublishingCopyResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons Publishing Engine bukan JSON yang valid");
  }

  const caption = asText(parsed.caption, 600);
  const hashtags = asHashtags(parsed.hashtags, 15);

  if (!caption) throw new Error("Respons Publishing Engine tidak menyertakan caption yang valid");
  if (hashtags.length === 0) throw new Error("Respons Publishing Engine tidak menyertakan hashtag yang valid");

  return { caption, hashtags };
}

/**
 * "Generate caption menggunakan AI Director" + "Generate hashtag yang
 * relevan" -- reasons over the same Creative Brief fields AI Director
 * (Sprint 3) produced for this content's storyboard, rephrased for the
 * destination platform's conventions.
 */
export async function generatePublishingCopy(input: GeneratePublishingCopyInput): Promise<PublishingCopyResult> {
  const userPrompt = `Tulis caption dan hashtag untuk konten video "${input.productProject}" yang akan dipublikasikan ke ${input.platform}.

Creative Brief dari AI Director:
- Big Idea: ${input.bigIdea}
- Hook: ${input.hook}
- Key Message: ${input.keyMessage}
- Target Emotion: ${input.targetEmotion}
- CTA: ${input.cta}
- Content Angle: ${input.contentAngle}

Panduan platform -- ${PLATFORM_GUIDANCE[input.platform]}

Hasilkan:
- caption: caption siap post yang mengangkat Big Idea/Key Message di atas dan menutup dengan CTA, mengikuti gaya platform tujuan
- hashtags: 8-12 hashtag relevan (campuran hashtag spesifik produk/brand dan hashtag niche/umum), tanpa spasi, setiap item diawali "#"

Balas HANYA dengan JSON object:
{"caption": "...", "hashtags": ["#...", "#..."]}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 800,
  });

  return parsePublishingCopyJson(response.text);
}
