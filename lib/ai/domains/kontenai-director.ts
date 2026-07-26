import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah AI Director untuk MK Connect, brand strategist & creative director berpengalaman untuk bisnis villa/occupancy dan beauty. Tugasmu menyusun Creative Brief yang tajam, actionable, dan LENGKAP SAMPAI ARAHAN PRODUKSI berdasarkan intent campaign dan aset yang tersedia di Asset Library. Brief-mu dieksekusi otomatis oleh mesin render tanpa ada manusia yang menambal keputusan yang kamu lewatkan, jadi setiap keputusan produksi harus kamu ambil secara eksplisit. Jawab selalu dalam Bahasa Indonesia KECUALI field yang diminta Bahasa Inggris. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

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

/**
 * Music direction.
 *
 * `searchQuery` is the field that actually changes the rendered output: the
 * render worker feeds it straight to Freesound. It used to reuse the brief's
 * bigIdea, so Freesound was being searched for things like "Villa Jogja
 * passive income" -- a creative concept, not a sound. That returns noise or
 * nothing, which is a large part of why audited content scored ~2. It must
 * therefore be ENGLISH audio vocabulary (genre/mood/instrument/tempo), not
 * Indonesian marketing copy.
 */
export interface MusicDirection {
  useMusic: boolean;
  genre: string;
  mood: string;
  tempoBpm: string;
  instrumentation: string;
  /** English, Freesound-friendly keywords only. */
  searchQuery: string;
  avoid: string;
}

/** Whether this piece is narrated at all, and if so how it should sound. */
export interface VoiceOverDirection {
  useVoiceOver: boolean;
  reason: string;
  language: string;
  tone: string;
  pace: string;
  openingLine: string;
  pronunciationNotes: string;
}

export interface VisualDirection {
  aspectRatio: string;
  durationSeconds: number;
  sceneCount: number;
  pacing: string;
  colorGrade: string;
  textOverlayStyle: string;
  transitionStyle: string;
}

export interface CaptionDirection {
  firstLine: string;
  body: string;
  hashtags: string[];
}

export interface ProductionDirection {
  music: MusicDirection;
  voiceOver: VoiceOverDirection;
  visual: VisualDirection;
  caption: CaptionDirection;
  /** Concrete things that would make this content fail its audit. */
  avoid: string[];
  /** What "good" looks like for this specific piece, so the audit has something to measure against. */
  successCriteria: string;
}

export interface CreativeBriefResult {
  bigIdea: string;
  hook: string;
  keyMessage: string;
  targetEmotion: string;
  cta: string;
  contentAngle: string;
  productionDirection: ProductionDirection;
}

function asText(value: unknown, maxChars: number, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxChars) : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asStringArray(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(item, maxChars))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

/**
 * Production direction is coerced with defaults rather than validated
 * strictly. The six creative fields stay required -- a brief without a big
 * idea is not a brief -- but a model that omits, say, transitionStyle should
 * not throw away an otherwise good brief and burn a retry. Every default
 * below is a safe, publishable choice.
 */
function parseProductionDirection(raw: unknown, platform: DirectorPlatform): ProductionDirection {
  const source = (raw ?? {}) as Record<string, unknown>;
  const music = (source.music ?? {}) as Record<string, unknown>;
  const voiceOver = (source.voiceOver ?? {}) as Record<string, unknown>;
  const visual = (source.visual ?? {}) as Record<string, unknown>;
  const caption = (source.caption ?? {}) as Record<string, unknown>;

  return {
    music: {
      useMusic: asBool(music.useMusic, true),
      genre: asText(music.genre, 120, "cinematic ambient"),
      mood: asText(music.mood, 120, "warm, aspirational"),
      tempoBpm: asText(music.tempoBpm, 40, "90-105"),
      instrumentation: asText(music.instrumentation, 200, "soft piano, warm pads, light percussion"),
      searchQuery: asText(music.searchQuery, 160, "warm cinematic ambient piano background loop"),
      avoid: asText(music.avoid, 200, "vocals, harsh EDM drops, distorted bass"),
    },
    voiceOver: {
      useVoiceOver: asBool(voiceOver.useVoiceOver, true),
      reason: asText(voiceOver.reason, 300, "Narasi dipakai karena pesan utama butuh penjelasan, bukan hanya visual."),
      language: asText(voiceOver.language, 60, "Bahasa Indonesia"),
      tone: asText(voiceOver.tone, 200, "hangat, tenang, meyakinkan"),
      pace: asText(voiceOver.pace, 120, "sedang, jeda singkat setiap kalimat"),
      openingLine: asText(voiceOver.openingLine, 300),
      pronunciationNotes: asText(voiceOver.pronunciationNotes, 300, "Sebut nama brand/lokasi apa adanya, jangan disingkat."),
    },
    visual: {
      aspectRatio: asText(visual.aspectRatio, 20, platform === "facebook" ? "1:1" : "9:16"),
      durationSeconds: asNumber(visual.durationSeconds, platform === "tiktok" ? 25 : 20, 8, 60),
      sceneCount: asNumber(visual.sceneCount, 5, 3, 10),
      pacing: asText(visual.pacing, 200, "cepat di 3 detik pertama, melambat saat menyampaikan pesan utama"),
      colorGrade: asText(visual.colorGrade, 200, "hangat, kontras sedang, highlight lembut"),
      textOverlayStyle: asText(visual.textOverlayStyle, 200, "sans-serif tebal, maksimal 6 kata per layar, posisi tengah-bawah"),
      transitionStyle: asText(visual.transitionStyle, 200, "cut langsung, tanpa transisi dekoratif"),
    },
    caption: {
      firstLine: asText(caption.firstLine, 200),
      body: asText(caption.body, 800),
      hashtags: asStringArray(caption.hashtags, 12, 40),
    },
    avoid: asStringArray(source.avoid, 8, 200),
    successCriteria: asText(source.successCriteria, 500, "Hook terbaca dalam 3 detik pertama, pesan utama jelas, CTA eksplisit."),
  };
}

function parseCreativeBriefJson(text: string, platform: DirectorPlatform): CreativeBriefResult {
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

  const productionDirection = parseProductionDirection(parsed.productionDirection, platform);

  // The narration the render engine speaks defaults to the hook when the
  // model gave no opening line -- silence at second zero is the single
  // costliest thing a short-form video can do.
  if (productionDirection.voiceOver.useVoiceOver && !productionDirection.voiceOver.openingLine) {
    productionDirection.voiceOver.openingLine = hook;
  }
  if (!productionDirection.caption.firstLine) {
    productionDirection.caption.firstLine = hook;
  }

  return { bigIdea, hook, keyMessage, targetEmotion, cta, contentAngle, productionDirection };
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
 *
 * The brief also carries full production direction (music, voice over,
 * visual grammar, caption). That is not documentation: the render worker
 * reads music.searchQuery and voiceOver.useVoiceOver directly, so anything
 * the brief leaves vague becomes a default the audit then marks down.
 */
export async function generateCreativeBrief(input: CreativeBriefInput): Promise<CreativeBriefResult> {
  const assetContext =
    input.assets.length > 0
      ? input.assets.map(describeAsset).join("\n")
      : "(Tidak ada aset yang sudah dianalisis Gemini Vision di Asset Library yang cocok untuk campaign ini -- gunakan asumsi umum berdasarkan brand/produk yang disebutkan, dan sebutkan di contentAngle bahwa tim perlu menyiapkan aset baru.)";

  const userPrompt = `Susun Creative Brief LENGKAP untuk campaign berikut:

- Objective: ${OBJECTIVE_LABELS[input.objective]}
- Platform: ${PLATFORM_LABELS[input.platform]}
- Target Audience: ${input.targetAudience}
- Product/Project: ${input.productProject}
- Campaign Goal: ${input.campaignGoal}

Aset yang tersedia di Asset Library (sudah dianalisis Gemini Vision):
${assetContext}

PENTING: brief ini dieksekusi OTOMATIS oleh mesin render. Tidak ada editor manusia
yang akan menambal keputusan yang kamu kosongkan. Setiap keputusan produksi
(pakai voice over atau tidak, musik seperti apa, berapa detik, berapa scene)
harus kamu putuskan sendiri secara spesifik. Jangan menulis arahan umum seperti
"musik yang cocok" atau "narasi yang menarik" -- sebutkan genre, mood, tempo,
instrumen, dan kata kunci pencarian yang konkret.

Hasilkan JSON dengan struktur berikut:

1. Enam field strategi kreatif:
- bigIdea: satu ide besar/konsep kreatif utama yang mengikat seluruh campaign (1-2 kalimat)
- hook: kalimat pembuka untuk 3 detik pertama yang langsung menahan scroll
- keyMessage: pesan utama yang harus tersampaikan (1-2 kalimat)
- targetEmotion: emosi utama yang ingin dibangkitkan
- cta: call-to-action konkret sesuai objective dan platform
- contentAngle: sudut pandang/format konten + alasan singkat kecocokannya dengan aset yang ada

2. productionDirection.music:
- useMusic (boolean): apakah konten ini pakai background music
- genre: genre musiknya (contoh: "lo-fi hip hop", "cinematic orchestral", "acoustic folk")
- mood: nuansa yang dibangun (contoh: "tenang dan mewah", "energik dan optimis")
- tempoBpm: rentang tempo, contoh "85-100"
- instrumentation: instrumen utama yang sebaiknya terdengar
- searchQuery: WAJIB BAHASA INGGRIS. Kata kunci pencarian musik royalty-free
  memakai kosakata AUDIO saja (genre, mood, instrumen, tempo, "loop",
  "background"). JANGAN memasukkan nama brand, nama tempat, atau istilah
  marketing -- kata kunci ini dipakai langsung untuk mencari file audio.
  Contoh benar: "warm acoustic guitar ambient background loop 90 bpm".
  Contoh SALAH: "musik untuk Villa Jogja passive income".
- avoid: karakter musik yang harus dihindari (contoh: "vokal, EDM drop keras")

3. productionDirection.voiceOver:
- useVoiceOver (boolean): apakah konten ini perlu narasi suara. Putuskan
  berdasarkan isi konten: konten edukasi/penjelasan angka biasanya BUTUH
  narasi; konten estetik/mood/tour visual seringkali lebih kuat TANPA narasi
  dan cukup teks di layar.
- reason: alasan singkat keputusan di atas
- language: bahasa narasi (contoh: "Bahasa Indonesia santai")
- tone: karakter suara (contoh: "hangat, tenang, meyakinkan")
- pace: kecepatan bicara dan pola jeda
- openingLine: kalimat pertama yang benar-benar diucapkan di detik 0-3
- pronunciationNotes: catatan pelafalan nama brand/lokasi/angka

4. productionDirection.visual:
- aspectRatio: rasio aspek ("9:16" untuk Instagram Reels/TikTok, "1:1" untuk feed Facebook)
- durationSeconds (angka): durasi total yang ideal untuk platform & objective ini
- sceneCount (angka): jumlah scene
- pacing: ritme penyuntingan, termasuk apa yang terjadi di 3 detik pertama
- colorGrade: arahan warna
- textOverlayStyle: gaya teks di layar, termasuk batas jumlah kata per layar
- transitionStyle: gaya transisi antar scene

5. productionDirection.caption:
- firstLine: baris pertama caption (yang terlihat sebelum "lihat selengkapnya")
- body: isi caption lengkap
- hashtags: array 5-10 hashtag relevan, tanpa tanda "#"

6. productionDirection.avoid: array hal konkret yang akan membuat konten ini gagal audit
7. productionDirection.successCriteria: ukuran konkret bahwa konten ini berhasil

Balas HANYA dengan JSON object dengan bentuk:
{"bigIdea":"...","hook":"...","keyMessage":"...","targetEmotion":"...","cta":"...","contentAngle":"...","productionDirection":{"music":{"useMusic":true,"genre":"...","mood":"...","tempoBpm":"...","instrumentation":"...","searchQuery":"...","avoid":"..."},"voiceOver":{"useVoiceOver":true,"reason":"...","language":"...","tone":"...","pace":"...","openingLine":"...","pronunciationNotes":"..."},"visual":{"aspectRatio":"...","durationSeconds":20,"sceneCount":5,"pacing":"...","colorGrade":"...","textOverlayStyle":"...","transitionStyle":"..."},"caption":{"firstLine":"...","body":"...","hashtags":["...","..."]},"avoid":["...","..."],"successCriteria":"..."}}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    // Roughly tripled from 1024: the brief now carries full production
    // direction, and a truncated response fails JSON.parse outright.
    maxOutputTokens: 3072,
  });

  return parseCreativeBriefJson(response.text, input.platform);
}
