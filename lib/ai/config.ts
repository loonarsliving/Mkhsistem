import "server-only";

import type { AIProviderName } from "./provider/types";

/**
 * Env-driven AI Operating System configuration. Nothing here is hardcoded —
 * every value has a safe default so behavior is unchanged until an operator
 * sets real credentials in Vercel, mirroring how Aiagent's @mkh/shared config
 * layer worked.
 */
export const AI_CONFIG = {
  /** Which AIProvider implementation lib/ai/provider/registry.ts resolves — only "gemini" exists today, but this makes provider selection an explicit config value rather than an implicit fact of there being one class. */
  provider: (process.env.AI_PROVIDER ?? "gemini") as AIProviderName,
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  temperature: Number(process.env.GEMINI_TEMPERATURE ?? "0.4"),
  maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? "1024"),
  timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? "20000"),
  safetyThreshold: process.env.AI_SAFETY_THRESHOLD ?? "BLOCK_MEDIUM_AND_ABOVE",
  /** Attempt 1 immediate, then attempts 2/3/4 wait retryBaseDelayMs * 2^(n-1) (20s/40s/80s by default) before retrying a transient (429/500/502/503/504/timeout) failure. */
  retryMaxAttempts: Number(process.env.GEMINI_RETRY_MAX_ATTEMPTS ?? "4"),
  retryBaseDelayMs: Number(process.env.GEMINI_RETRY_BASE_DELAY_MS ?? "20000"),
  /** How long a successful healthCheck() result is reused before probing Gemini again — a failed check is never cached, so it's always re-checked on the next call. */
  healthCheckCacheMs: Number(process.env.AI_HEALTHCHECK_CACHE_MS ?? "300000"),
} as const;

export const WHATSAPP_CONFIG = {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "",
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
} as const;

export function isGeminiConfigured(): boolean {
  return AI_CONFIG.geminiApiKey.length > 0;
}

export function isWhatsAppConfigured(): boolean {
  return (
    WHATSAPP_CONFIG.accessToken.length > 0 &&
    WHATSAPP_CONFIG.phoneNumberId.length > 0 &&
    WHATSAPP_CONFIG.businessAccountId.length > 0 &&
    WHATSAPP_CONFIG.verifyToken.length > 0
  );
}
