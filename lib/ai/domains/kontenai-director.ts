import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah AI Director untuk MK Connect, brand strategist & creative director berpengalaman untuk bisnis leasehold properti, villa/occupancy, dan beauty. Tugasmu menyusun Creative Brief yang tajam dan actionable berdasarkan intent campaign dan aset yang tersedia di Asset Library. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export type DirectorObjective = "brand_awareness" | "leads" | "sales" | "engagement";
export type DirectorPlatform = "instagram" | "tiktok" | "facebook";

const OBJECTIVE_LABELS: Record<DirectorObjective, string> = {
  brand_awareness: "Brand Awareness",
  leads: "Leads",
  sales: "Sales",
  engagement: "Engagement",
};

const PLATFORM_LABELS: Record<DirectorPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

export interface DirectorAssetContext {
  title: string;
  assetType: string;
  aiDescription: string | null;
  aiTags: string[];
  aiCategory: string | null;
  aiMood: string | null;
}

export interface CreativeBriefInput {
  objective: DirectorObjective;
  platform: DirectorPlatform;
  targetAudience: string;
  productProject: string;
  campaignGoal: string;
  assets: DirectorAssetContext[];
}

export interface CreativeBriefResult {
  bigIdea: string;
  hook: string;
  keyMessage: string;
  targetEmotion: string;
  cta: string;
  contentAngle: string;
}

function asText(value: unknown, maxChars: number): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxChars) : "";
}

function parseCreativeBriefJson(text: string): CreativeBriefResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI Director bukan JSON yang valid");
  }

  const bigIdea = asText(parsed.bigIdea, 300);
  const hook = asText(parsed.hook, 300);
  const keyMessage = asText(parsed.keyMessage, 400);
  const targetEmotion = asText(parsed.targetEmotion, 120);
  const cta = asText(parsed.cta, 200);
  const contentAngle = asText(parsed.contentAngle, 300);

  if (!bigIdea || !hook || !keyMessage || !targetEmotion || !cta || !contentAngle) {
    throw new Error("Respons AI Director tidak lengkap (ada field Creative Brief yang kosong)");
  }

  return { bigIdea, hook, keyMessage, targetEmotion, cta, contentAngle };
}

function describeAsset(asset: DirectorAssetContext, index: number): string {
  const parts = [
    `${index + 1}. [${asset.assetType}] "${asset.title}"`,
    asset.aiCategory ? `kategori: ${asset.aiCategory}` : null,
    asset.aiDescription ? `deskripsi: ${asset.aiDescription}` : null,
    asset.aiTags.length > 0 ? `tags: ${asset.aiTags.join(", ")}` : null,
    asset.aiMood ? `mood: ${asset.aiMood}` : null,
  ].filter(Boolean);
  return parts.join(" -- ");
}

/**
 * Turns a campaign intent (objective/platform/audience/product/goal) plus
 * real Asset Library + Gemini Vision context into one Creative Brief. This
 * is AI Director's core reasoning step -- it never invents assets, it only
 * reasons over what Gemini Vision has already actually seen and described
 * (Sprint 2), so the brief stays grounded in what the team can realistically
 * shoot/edit with.
 */
export async function generateCreativeBrief(input: CreativeBriefInput): Promise<CreativeBriefResult> {
  const assetContext =
    input.assets.length > 0
      ? input.assets.map(describeAsset).join("\n")
      : "(Tidak ada aset yang sudah dianalisis Gemini Vision di Asset Library yang cocok untuk campaign ini -- gunakan asumsi umum berdasarkan brand/produk yang disebutkan, dan sebutkan di contentAngle bahwa tim perlu menyiapkan aset baru.)";

  const userPrompt = `Susun Creative Brief untuk campaign berikut:

- Objective: ${OBJECTIVE_LABELS[input.objective]}
- Platform: ${PLATFORM_LABELS[input.platform]}
- Target Audience: ${input.targetAudience}
- Product/Project: ${input.productProject}
- Campaign Goal: ${input.campaignGoal}

Aset yang tersedia di Asset Library (sudah dianalisis Gemini Vision):
${assetContext}

Berdasarkan intent campaign dan aset di atas, hasilkan Creative Brief dengan field:
- bigIdea: satu ide besar/konsep kreatif utama yang mengikat seluruh campaign (1-2 kalimat)
- hook: kalimat pembuka/hook untuk 3 detik pertama yang langsung menarik perhatian target audience
- keyMessage: pesan utama yang harus tersampaikan ke audience (1-2 kalimat)
- targetEmotion: emosi utama yang ingin dibangkitkan pada audience (contoh: penasaran, percaya diri, urgensi, hangat, terinspirasi)
- cta: call-to-action konkret yang sesuai objective dan platform
- contentAngle: sudut pandang/format konten yang disarankan (contoh: testimoni, before-after, edukasi, behind-the-scenes, urgensi promo), dengan alasan singkat mengapa sudut pandang ini cocok dengan aset yang tersedia

Balas HANYA dengan JSON object:
{"bigIdea": "...", "hook": "...", "keyMessage": "...", "targetEmotion": "...", "cta": "...", "contentAngle": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 1024,
  });

  return parseCreativeBriefJson(response.text);
}
