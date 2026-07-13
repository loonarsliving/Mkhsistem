import "server-only";

/**
 * Env-driven AI Operating System configuration. Nothing here is hardcoded —
 * every value has a safe default so behavior is unchanged until an operator
 * sets real credentials in Vercel, mirroring how Aiagent's @mkh/shared config
 * layer worked.
 */
export const AI_CONFIG = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  temperature: Number(process.env.GEMINI_TEMPERATURE ?? "0.4"),
  maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? "1024"),
  timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? "20000"),
  safetyThreshold: process.env.AI_SAFETY_THRESHOLD ?? "BLOCK_MEDIUM_AND_ABOVE",
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
