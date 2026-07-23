import "server-only";

import { AI_CONFIG, isGeminiConfigured } from "../config";
import { createGeminiClient } from "./gemini-client";
import { GeminiProvider } from "./gemini-provider";
import type { AIProvider, AIProviderName } from "./types";

let cachedProvider: AIProvider | null = null;

/**
 * The single provider abstraction boundary — every module that needs AI
 * (HR/Markom/CRM domain helpers, the WhatsApp job processor, health checks)
 * goes through lib/ai/service.ts, which resolves exactly one AIProvider
 * instance from here and never imports GeminiProvider or any concrete
 * provider directly. Adding a second provider (OpenAI/Claude/OpenRouter)
 * means implementing the AIProvider interface (lib/ai/provider/types.ts)
 * once and adding one case below — no other file in the codebase needs to
 * change, since callers only ever see the AIProvider interface.
 *
 * Only "gemini" is implemented today (AI_PROVIDER env var, default
 * "gemini") — this file makes that an explicit, single-point decision
 * instead of an implicit fact of there being only one class, and is where
 * a second provider gets wired in later without touching any caller.
 */
function buildProvider(name: AIProviderName): AIProvider {
  switch (name) {
    case "gemini": {
      if (!isGeminiConfigured()) {
        throw new Error("AI Service: GEMINI_API_KEY is not set. Configure it in Vercel Environment Variables to enable AI features.");
      }
      const client = createGeminiClient(AI_CONFIG.geminiApiKey);
      return new GeminiProvider(client, {
        model: AI_CONFIG.geminiModel,
        defaultTemperature: AI_CONFIG.temperature,
        defaultMaxOutputTokens: AI_CONFIG.maxOutputTokens,
        timeoutMs: AI_CONFIG.timeoutMs,
        safetyThreshold: AI_CONFIG.safetyThreshold,
        retryMaxAttempts: AI_CONFIG.retryMaxAttempts,
        retryBaseDelayMs: AI_CONFIG.retryBaseDelayMs,
      });
    }
    default: {
      // Exhaustiveness check: TypeScript errors here if AIProviderName ever
      // gains a value this switch doesn't handle.
      const exhaustive: never = name;
      throw new Error(`AI Service: unknown provider "${exhaustive}"`);
    }
  }
}

export function resolveAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = buildProvider(AI_CONFIG.provider);
  return cachedProvider;
}
