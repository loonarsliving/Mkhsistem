import "server-only";

import { askAI } from "@/lib/ai/service";

/**
 * Villa receptionist chat: two-way translation (owner request 2026-09-28).
 * Guests write in their own language and the receptionist reads Indonesian;
 * the receptionist writes Indonesian and the guest receives their language.
 *
 * TRANSLATION ONLY. The model never answers the guest, never adds or drops
 * content, and never changes names, numbers, dates, prices, or emojis --
 * the receptionist is the one talking to the guest. Called from villa's
 * server (src/lib/aiBridge.ts) through app/api/villa/ai/translate.
 */

export interface ChatTranslation {
  /** ISO 639-1 base code of the source text, lowercase (e.g. "en", "zh", "id"). */
  detectedLanguage: string;
  translation: string;
}

export const MAX_TRANSLATE_CHARS = 4000;

const SYSTEM_PROMPT = [
  "You are a translation engine for WhatsApp messages between a villa's receptionist and hotel guests.",
  "Translate the given text into the target language faithfully.",
  "Preserve meaning, tone, politeness, line breaks, emojis, names, numbers, dates, times, prices, unit codes, and URLs exactly.",
  "Do NOT answer the message, do NOT add greetings or explanations, do NOT omit anything.",
  "If the text is already in the target language, return it unchanged.",
  'Reply with ONLY a JSON object: {"detected_language": "<ISO 639-1 code of the source text>", "translation": "<translated text>"}',
].join(" ");

/** Accepts "en", "zh", "zh-TW", "pt-BR"; returns the lowercase base code, or null. */
export function normalizeLanguageCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^([a-zA-Z]{2,3})(?:[-_][a-zA-Z]{2,4})?$/);
  return m ? m[1].toLowerCase() : null;
}

/** Parses the model's reply; throws on anything that isn't a usable translation. */
export function parseTranslationReply(raw: string): ChatTranslation {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as { detected_language?: unknown; translation?: unknown };
  const detectedLanguage = normalizeLanguageCode(parsed.detected_language);
  if (!detectedLanguage) throw new Error("translation reply has no valid detected_language");
  if (typeof parsed.translation !== "string" || parsed.translation.trim().length === 0) {
    throw new Error("translation reply has no translation text");
  }
  return { detectedLanguage, translation: parsed.translation.trim() };
}

export async function translateChatMessage(text: string, targetLanguage: string): Promise<ChatTranslation> {
  const userPrompt = `Target language (ISO 639-1): ${targetLanguage}\n\nText:\n"""\n${text}\n"""`;
  const raw = await askAI(SYSTEM_PROMPT, userPrompt, { temperature: 0, maxOutputTokens: 2048 });
  return parseTranslationReply(raw);
}
