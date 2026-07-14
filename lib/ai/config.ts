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
  /**
   * gemini-3.1-flash-lite, not gemini-3.5-flash: once the request itself was
   * fixed (thinkingLevel casing, see gemini-provider.ts), telemetry showed
   * gemini-3.5-flash succeeding but under heavy real load -- mostly 503
   * "high demand" / 20s timeouts, one success that itself took 18.3s. That's
   * Google-side capacity for that specific model, not something fixable
   * here; the lighter Flash-Lite tier is the practical mitigation.
   * ("gemini-2.5-flash" 404'd as deprecated; "gemini-flash-latest" tracked a
   * lower-capacity preview model -- see git history for that trail.)
   */
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
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
  /** The one credential the Whacenter gateway actually sends with (see WhatsAppConnector.dispatch) -- the four WHATSAPP_* vars above are Meta Cloud API leftovers only WHATSAPP_VERIFY_TOKEN (webhook verification) still uses. */
  whacenterDeviceId: process.env.WHACENTER_DEVICE_ID ?? "",
} as const;

export function isGeminiConfigured(): boolean {
  return AI_CONFIG.geminiApiKey.length > 0;
}

/** Gated on WHACENTER_DEVICE_ID alone -- that's the only credential WhatsAppConnector.dispatch/healthCheck actually send with against the Whacenter gateway. */
export function isWhatsAppConfigured(): boolean {
  return WHATSAPP_CONFIG.whacenterDeviceId.length > 0;
}
