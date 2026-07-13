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
    retryMaxAttempts: AI_CONFIG.retryMaxAttempts,
    retryBaseDelayMs: AI_CONFIG.retryBaseDelayMs,
  });
  return cachedProvider;
}

/**
 * The AI Service — the ONLY sanctioned entrypoint for every module (HR,
 * Markom, CRM, the WhatsApp webhook handler, reminder jobs) that needs a
 * model call. Never import lib/ai/provider/* directly from feature code.
 * Every call transparently gets the centralized Gemini retry/backoff layer
 * (lib/ai/provider/gemini-retry.ts) via GeminiProvider.generate() — HR AI,
 * Markom AI, CRM AI, the WhatsApp webhook, and reminder jobs all share the
 * exact same resilience behavior with zero code of their own.
 */
export async function generateAIText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
  return getAIProvider().generate(request);
}

interface CachedHealthCheck {
  result: { ok: boolean; detail: string; configured: boolean };
  cachedAt: number;
}

let cachedHealthCheck: CachedHealthCheck | null = null;

/**
 * A successful result is cached for AI_CONFIG.healthCheckCacheMs (default 5
 * minutes) so repeated health probes (monitoring, dashboards, ...) don't
 * each burn a real Gemini call. A failure is never cached — the next call
 * always re-checks, so a real recovery is never masked by a stale "down"
 * result.
 */
export async function aiHealthCheck(): Promise<{ ok: boolean; detail: string; configured: boolean }> {
  if (!isGeminiConfigured()) {
    return { ok: false, detail: "GEMINI_API_KEY is not configured", configured: false };
  }

  if (cachedHealthCheck && Date.now() - cachedHealthCheck.cachedAt < AI_CONFIG.healthCheckCacheMs) {
    return { ...cachedHealthCheck.result, detail: `${cachedHealthCheck.result.detail} (cached)` };
  }

  const result = await getAIProvider().healthCheck();
  const fullResult = { ...result, configured: true };
  if (result.ok) {
    cachedHealthCheck = { result: fullResult, cachedAt: Date.now() };
  }
  return fullResult;
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
