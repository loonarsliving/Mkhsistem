import "server-only";

import { generateAIText } from "../service";
import {
  MIN_LEARNING_SAMPLE_SIZE,
  OCCUPANCY_ADS_ALLOWED_DESTINATION_ORIGIN,
  OCCUPANCY_CAMPAIGN_TYPES,
  OCCUPANCY_CAMPAIGN_TYPE_TEMPLATES,
  OCCUPANCY_MARKET_CANDIDATES,
  OCCUPANCY_PERSONA_CANDIDATES,
  clampToBudgetCeiling,
  type OccupancyCampaignType,
  type OccupancyMarket,
  type OccupancyPersona,
} from "@/lib/occupancy/campaign-rules";
import type { GapSummary } from "@/lib/occupancy/gap-engine";

/**
 * Loonars AI Occupancy Ads engine -- follows the exact hand-rolled-JSON-
 * parse convention used everywhere else in lib/ai/domains/*.ts (see
 * markom.ts): prompt Gemini to reply with ONLY a JSON object (no markdown
 * fence), then parseOccupancyBriefJson strips fences, JSON.parses, and
 * manually validates/coerces/clamps every field, throwing a descriptive
 * error on anything missing/invalid. No Zod/schema-based structured
 * output, matching the rest of this codebase.
 *
 * Guardrail (root CLAUDE.md's FRIDAY principle, applied here): every
 * NUMBER the AI is handed (occupancy_gap, classification, budget ceiling)
 * was already computed by lib/occupancy/gap-engine.ts in plain TypeScript
 * before this file ever runs -- the model only reasons about market/
 * persona/creative/copy over those numbers, and recommended_budget from
 * its own output is ALWAYS re-clamped in code (clampToBudgetCeiling)
 * before it can reach anything that spends money.
 */

const SYSTEM_PROMPT = `Kamu adalah AI Occupancy Ads Strategist untuk Loonars (properti sewa/penginapan, destinasi loonars.id). Tugasmu: berdasarkan data okupansi yang SUDAH dihitung sistem (jangan pernah menghitung ulang atau mengarang angka okupansi/gap sendiri), rancang SATU brief campaign iklan Meta untuk mengisi tanggal-tanggal yang okupansinya rendah.

ATURAN KERAS:
- target_market HARUS salah satu dari daftar pasar yang diberikan -- jangan mengarang kota/wilayah lain.
- audience_persona HARUS salah satu dari daftar persona yang diberikan.
- campaign_objective HARUS salah satu dari daftar tipe campaign yang diberikan.
- recommended_budget HANYA usulan awal -- sistem akan membatasinya sesuai plafon admin, jangan khawatir soal angka pastinya.
- destination_url HARUS PERSIS "${OCCUPANCY_ADS_ALLOWED_DESTINATION_ORIGIN}" atau halaman di bawahnya -- jangan pernah link lain.
- JANGAN sarankan mengiklankan tanggal yang sudah HIGH/FULL -- fokus hanya ke tanggal LOW yang diberikan.
- Tulis primary_text/headline/description dalam Bahasa Indonesia yang natural, membumi, tidak seperti press release.`;

export interface OccupancyAdsBriefInput {
  propertyName: string;
  gapSummary: GapSummary;
  /** Human-readable list of the actual LOW dates to advertise (already filtered by selectAdvertisableDates -- never includes HIGH/FULL dates). */
  lowDates: { date: string; occupancyPct: number; availableUnits: number }[];
  maxDailyBudgetIdr: number;
  /** Real, tagged, ready-status creative assets available to pick from -- the AI selects among these ids, it never invents an asset. */
  availableAssets: { id: string; filename: string; tags: string[] }[];
  /** Past learnings meeting MIN_LEARNING_SAMPLE_SIZE, if any -- otherwise omitted so the AI doesn't lean on an unreliable single data point. */
  reliableLearnings?: { market: string; persona: string; creativeAngle: string; avgCac: number | null; avgCtr: number | null; sampleSize: number }[];
}

export interface OccupancyAdsBrief {
  campaignObjective: OccupancyCampaignType;
  targetDates: string[];
  targetMarket: OccupancyMarket;
  audiencePersona: OccupancyPersona;
  creativeAngle: string;
  offer: string;
  /** Raw AI suggestion -- callers MUST re-clamp with clampToBudgetCeiling before using this for anything that spends money. */
  recommendedDailyBudgetIdrRaw: number;
  durationDays: number;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  destinationUrl: string;
  selectedAssetIds: string[];
  reasoning: string;
  confidence: "low" | "medium" | "high";
}

function parseStringArray(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, max) : [];
}

/** Strips a markdown code fence if present and JSON.parses -- same convention as markom.ts's parseChecklistJson etc. */
function stripFenceAndParse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

export function parseOccupancyAdsBriefJson(text: string): OccupancyAdsBrief {
  const parsed = stripFenceAndParse(text) as Record<string, unknown>;

  if (typeof parsed.campaign_objective !== "string" || !(OCCUPANCY_CAMPAIGN_TYPES as readonly string[]).includes(parsed.campaign_objective)) {
    throw new Error(`AI occupancy ads brief missing/invalid campaign_objective (must be one of ${OCCUPANCY_CAMPAIGN_TYPES.join(", ")})`);
  }
  if (typeof parsed.target_market !== "string" || !(OCCUPANCY_MARKET_CANDIDATES as readonly string[]).includes(parsed.target_market)) {
    throw new Error(`AI occupancy ads brief missing/invalid target_market (must be one of ${OCCUPANCY_MARKET_CANDIDATES.join(", ")})`);
  }
  if (typeof parsed.audience_persona !== "string" || !(OCCUPANCY_PERSONA_CANDIDATES as readonly string[]).includes(parsed.audience_persona)) {
    throw new Error(`AI occupancy ads brief missing/invalid audience_persona (must be one of ${OCCUPANCY_PERSONA_CANDIDATES.join(", ")})`);
  }
  if (typeof parsed.primary_text !== "string" || parsed.primary_text.trim().length === 0) {
    throw new Error("AI occupancy ads brief missing primary_text");
  }
  if (typeof parsed.headline !== "string" || parsed.headline.trim().length === 0) {
    throw new Error("AI occupancy ads brief missing headline");
  }
  if (typeof parsed.reasoning !== "string" || parsed.reasoning.trim().length === 0) {
    throw new Error("AI occupancy ads brief missing reasoning");
  }

  const targetDates = parseStringArray(parsed.target_dates, 60).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (targetDates.length === 0) {
    throw new Error("AI occupancy ads brief missing valid target_dates");
  }

  const rawBudget = Number(parsed.recommended_budget);
  const recommendedDailyBudgetIdrRaw = Number.isFinite(rawBudget) && rawBudget > 0 ? Math.round(rawBudget) : 0;

  const rawDuration = Number(parsed.duration);
  const durationDays = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.min(60, Math.round(rawDuration)) : 7;

  // destination_url is NEVER trusted from the model beyond a sanity default
  // -- the caller (Server Action) re-validates with isAllowedOccupancyDestinationUrl
  // before allowing launch regardless of what's parsed here.
  const destinationUrl =
    typeof parsed.destination_url === "string" && parsed.destination_url.trim().startsWith(OCCUPANCY_ADS_ALLOWED_DESTINATION_ORIGIN)
      ? parsed.destination_url.trim()
      : OCCUPANCY_ADS_ALLOWED_DESTINATION_ORIGIN;

  const confidence: OccupancyAdsBrief["confidence"] = parsed.confidence === "high" || parsed.confidence === "low" ? parsed.confidence : "medium";

  return {
    campaignObjective: parsed.campaign_objective as OccupancyCampaignType,
    targetDates,
    targetMarket: parsed.target_market as OccupancyMarket,
    audiencePersona: parsed.audience_persona as OccupancyPersona,
    creativeAngle: typeof parsed.creative_angle === "string" ? parsed.creative_angle.trim().slice(0, 300) : "",
    offer: typeof parsed.offer === "string" ? parsed.offer.trim().slice(0, 300) : "",
    recommendedDailyBudgetIdrRaw,
    durationDays,
    primaryText: (parsed.primary_text as string).trim().slice(0, 2000),
    headline: (parsed.headline as string).trim().slice(0, 200),
    description: typeof parsed.description === "string" ? parsed.description.trim().slice(0, 500) : "",
    cta: typeof parsed.cta === "string" && parsed.cta.trim().length > 0 ? parsed.cta.trim().slice(0, 80) : "Pesan Sekarang",
    destinationUrl,
    selectedAssetIds: parseStringArray(parsed.selected_assets, 10),
    reasoning: (parsed.reasoning as string).trim().slice(0, 1500),
    confidence,
  };
}

function buildBriefPrompt(input: OccupancyAdsBriefInput): string {
  const lowDatesBlock = input.lowDates.map((d) => `- ${d.date}: okupansi ${d.occupancyPct}%, ${d.availableUnits} unit tersedia`).join("\n");
  const assetsBlock =
    input.availableAssets.length > 0
      ? input.availableAssets.map((a) => `- id="${a.id}" file="${a.filename}" tags=[${a.tags.join(", ")}]`).join("\n")
      : "(belum ada aset kreatif siap pakai -- boleh kosongkan selected_assets)";
  const learningsBlock =
    input.reliableLearnings && input.reliableLearnings.length > 0
      ? `Data historis campaign serupa (sample size >= ${MIN_LEARNING_SAMPLE_SIZE}, cukup diandalkan):\n${input.reliableLearnings
          .map((l) => `- pasar ${l.market}, persona ${l.persona}, angle "${l.creativeAngle}": rata-rata CAC ${l.avgCac ?? "n/a"}, CTR ${l.avgCtr ?? "n/a"}% (n=${l.sampleSize})`)
          .join("\n")}`
      : "Belum ada data historis campaign yang cukup sample size-nya untuk diandalkan -- rancang brief berdasarkan data okupansi & pengetahuan umum saja.";

  const templateGuidance = OCCUPANCY_CAMPAIGN_TYPES.map((t) => `- ${t}: ${OCCUPANCY_CAMPAIGN_TYPE_TEMPLATES[t].guidance}`).join("\n");

  return `Properti: ${input.propertyName}

Ringkasan okupansi (dihitung sistem, JANGAN dihitung ulang):
- Total hari dianalisis: ${input.gapSummary.totalDays}
- Hari LOW (di bawah target): ${input.gapSummary.lowDays}
- Rata-rata okupansi: ${input.gapSummary.averageOccupancyPct}%
- Rata-rata gap: ${input.gapSummary.averageGapPct} poin persen

Tanggal-tanggal LOW yang perlu diiklankan (HANYA ini yang boleh masuk target_dates -- jangan tambah tanggal lain):
${lowDatesBlock}

Plafon budget harian maksimum dari admin: Rp ${input.maxDailyBudgetIdr.toLocaleString("id-ID")} (usulanmu akan dibatasi otomatis ke angka ini, jadi usulkan angka yang menurutmu ideal, sistem yang akan menyesuaikan).

Pilihan tipe campaign (pilih salah satu paling cocok):
${templateGuidance}

Pasar yang boleh dipilih (pilih salah satu): ${OCCUPANCY_MARKET_CANDIDATES.join(", ")}
Persona yang boleh dipilih (pilih salah satu): ${OCCUPANCY_PERSONA_CANDIDATES.join(", ")}

Aset kreatif yang tersedia (pilih 0+ dari daftar ini untuk selected_assets, JANGAN mengarang id):
${assetsBlock}

${learningsBlock}

Balas HANYA dengan JSON object (tanpa markdown code fence, tanpa penjelasan tambahan):
{
  "campaign_objective": "salah satu dari daftar tipe campaign",
  "target_dates": ["YYYY-MM-DD", ...HANYA dari daftar tanggal LOW di atas],
  "target_market": "salah satu dari daftar pasar",
  "audience_persona": "salah satu dari daftar persona",
  "creative_angle": "1 kalimat sudut pandang kreatif",
  "offer": "1 kalimat penawaran konkret (boleh diskon/paket/insentif)",
  "recommended_budget": angka_rupiah_per_hari,
  "duration": jumlah_hari_campaign_berjalan,
  "primary_text": "teks utama iklan, Bahasa Indonesia, natural",
  "headline": "headline singkat",
  "description": "deskripsi pendukung",
  "cta": "teks tombol CTA singkat",
  "destination_url": "${OCCUPANCY_ADS_ALLOWED_DESTINATION_ORIGIN}",
  "selected_assets": ["id aset dari daftar di atas, atau kosong"],
  "reasoning": "2-4 kalimat alasan strategi ini",
  "confidence": "low, medium, atau high"
}`;
}

/**
 * Step 1 of the two-step flow (mirrors features/markom/actions/ads.actions.ts):
 * research/draft ONLY -- no Meta spend, no DB write here (the caller
 * persists the returned brief as a draft row). Throws (never silently
 * returns a fabricated brief) if the model's response can't be parsed.
 */
export async function generateOccupancyAdsBrief(input: OccupancyAdsBriefInput): Promise<OccupancyAdsBrief> {
  const response = await generateAIText({ systemPrompt: SYSTEM_PROMPT, userPrompt: buildBriefPrompt(input), maxOutputTokens: 1536, temperature: 0.6 });
  return parseOccupancyAdsBriefJson(response.text);
}

/** Re-clamps a brief's raw AI budget suggestion to the admin ceiling -- the ONLY value callers may pass on to anything that spends real money. */
export function resolveLaunchBudgetIdr(brief: Pick<OccupancyAdsBrief, "recommendedDailyBudgetIdrRaw">, maxDailyBudgetIdr: number): number {
  return clampToBudgetCeiling(brief.recommendedDailyBudgetIdrRaw, maxDailyBudgetIdr);
}

// ---------------------------------------------------------------------------
// Occupancy AI Copilot ("Ask Occupancy AI", spec §38) -- answers ONLY from
// real queried data fed into the prompt (same JSON-in-JSON-out discipline),
// never a free-form chatbot that can invent occupancy/campaign figures.
// ---------------------------------------------------------------------------

export interface OccupancyCopilotContext {
  question: string;
  gapSummary: GapSummary;
  activeCampaignsSummary: string[];
  recentLearningsSummary: string[];
}

export interface OccupancyCopilotAnswer {
  answer: string;
  /** True when the question asked about something not present in the supplied context -- the answer must say so explicitly rather than guess. */
  dataGap: boolean;
}

function parseCopilotAnswerJson(text: string): OccupancyCopilotAnswer {
  const parsed = stripFenceAndParse(text) as Record<string, unknown>;
  if (typeof parsed.answer !== "string" || parsed.answer.trim().length === 0) {
    throw new Error("AI occupancy copilot response missing answer text");
  }
  return { answer: parsed.answer.trim().slice(0, 2000), dataGap: parsed.data_gap === true };
}

export async function askOccupancyCopilot(ctx: OccupancyCopilotContext): Promise<OccupancyCopilotAnswer> {
  const systemPrompt = `Kamu adalah Occupancy AI Copilot -- kamu HANYA boleh menjawab dari data nyata yang diberikan di prompt (okupansi, campaign, histori). JANGAN PERNAH mengarang angka yang tidak ada di data. Kalau pertanyaan menyentuh sesuatu yang tidak ada datanya, katakan itu terus terang (set data_gap: true) daripada menebak.`;
  const userPrompt = `Data okupansi saat ini: rata-rata okupansi ${ctx.gapSummary.averageOccupancyPct}%, ${ctx.gapSummary.lowDays} hari LOW dari ${ctx.gapSummary.totalDays} hari dianalisis, rata-rata gap ${ctx.gapSummary.averageGapPct} poin persen.

Campaign aktif:
${ctx.activeCampaignsSummary.length > 0 ? ctx.activeCampaignsSummary.join("\n") : "(tidak ada campaign aktif)"}

Ringkasan histori campaign:
${ctx.recentLearningsSummary.length > 0 ? ctx.recentLearningsSummary.join("\n") : "(belum ada histori)"}

Pertanyaan: "${ctx.question}"

Balas HANYA dengan JSON object: {"answer": "jawaban Bahasa Indonesia berdasarkan data di atas SAJA", "data_gap": true_atau_false}`;

  const response = await generateAIText({ systemPrompt, userPrompt, maxOutputTokens: 800, temperature: 0.3 });
  return parseCopilotAnswerJson(response.text);
}
