import "server-only";

import { AI_CONFIG, isGeminiConfigured } from "./config";
import { resolveAIProvider } from "./provider/registry";
import type { AIGenerateRequest, AIGenerateResponse } from "./provider/types";

/**
 * The AI Service — the ONLY sanctioned entrypoint for every module (HR,
 * Markom, CRM, the WhatsApp job processor, reminder jobs) that needs a
 * model call. Never import lib/ai/provider/* directly from feature code;
 * provider selection itself lives in lib/ai/provider/registry.ts. Every
 * call transparently gets the centralized retry/backoff layer
 * (lib/ai/provider/gemini-retry.ts), the shared circuit breaker, and
 * per-attempt telemetry via GeminiProvider.generate() — HR AI, Markom AI,
 * CRM AI, the WhatsApp webhook pipeline, and reminder jobs all share the
 * exact same resilience behavior with zero code of their own.
 */
export async function generateAIText(request: AIGenerateRequest): Promise<AIGenerateResponse> {
  return resolveAIProvider().generate(request);
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

  const result = await resolveAIProvider().healthCheck();
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
export async function askAI(
  systemPrompt: string,
  userPrompt: string,
  opts?: { temperature?: number; maxOutputTokens?: number; maxAttempts?: number; jobId?: string },
): Promise<string> {
  const response = await generateAIText({
    systemPrompt,
    userPrompt,
    temperature: opts?.temperature,
    maxOutputTokens: opts?.maxOutputTokens,
    maxAttempts: opts?.maxAttempts,
    jobId: opts?.jobId,
  });
  return response.text;
}
