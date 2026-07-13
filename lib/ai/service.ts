import "server-only";

import { AI_CONFIG, isGeminiConfigured } from "./config";
import { createGeminiClient } from "./provider/gemini-client";
import { GeminiProvider } from "./provider/gemini-provider";
import type { AIGenerateRequest, AIGenerateResponse, AIProvider } from "./provider/types";

let cachedProvider: AIProvider | null = null;

/**
 * Single resolution point for "which AI provider is active". Gemini today;
 * swapping providers later means implementing AIProvider once and changing
 * this function — no other module (HR/Markom/CRM AI, the webhook handler,
 * reminders) ever imports Gemini directly.
 */
function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;
  if (!isGeminiConfigured()) {
    throw new Error("AI Service: GEMINI_API_KEY is not set. Configure it in Vercel Environment Variables to enable AI features.");
  }
  const client = createGeminiClient(AI_CONFIG.geminiApiKey);
  cachedProvider = new GeminiProvider(client, {
    model: AI_CONFIG.geminiModel,
    defaultTemperature: AI_CONFIG.temperature,
    defaultMaxOutputTokens: AI_CONFIG.maxOutputTokens,
    timeoutMs: AI_CONFIG.timeoutMs,
    safetyThreshold: AI_CONFIG.safetyThreshold,
  });
  return cachedProvider;
}

/**
 * The AI Service — the ONLY sanctioned entrypoint for every module (HR,
 * Markom, CRM, the WhatsApp webhook handler, reminder jobs) that needs a
 * model call. Never import lib/ai/provider/* directly from feature code.
 */
export async function generateAIText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
  return getAIProvider().generate(request);
}

export async function aiHealthCheck(): Promise<{ ok: boolean; detail: string; configured: boolean }> {
  if (!isGeminiConfigured()) {
    return { ok: false, detail: "GEMINI_API_KEY is not configured", configured: false };
  }
  const result = await getAIProvider().healthCheck();
  return { ...result, configured: true };
}

/**
 * Convenience wrapper for the common "one domain-scoped question, one text
 * answer" case every HR/Markom/CRM AI helper uses — thin sugar over
 * generateAIText, still the AI Service, never a direct Gemini call.
 */
export async function askAI(systemPrompt: string, userPrompt: string, opts?: { temperature?: number; maxOutputTokens?: number }): Promise<string> {
  const response = await generateAIText({
    systemPrompt,
    userPrompt,
    temperature: opts?.temperature,
    maxOutputTokens: opts?.maxOutputTokens,
  });
  return response.text;
}
