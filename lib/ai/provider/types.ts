/**
 * Ported from Aiagent (packages/ai-provider/src/types.ts) — the plug-and-play
 * AI Provider contract. Only Gemini is implemented here; the shape is kept
 * identical so a future provider can be added without touching lib/ai/service.ts.
 */
export type AIProviderName = "gemini";

export interface AIGenerateRequest {
  /** System-level instructions — role, rules, output format. Never user-authored. */
  systemPrompt: string;
  /** The actual task/context for this call. */
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** "json" asks the provider to return a parseable JSON string. */
  responseFormat?: "text" | "json";
  /**
   * Overrides AI_CONFIG.retryMaxAttempts for this one call — every call still
   * goes through the same centralized retry wrapper, this only changes how
   * many attempts it's allowed. healthCheck() passes 1 here so a routine
   * probe never burns a full 429/503 backoff sequence; omit for the normal
   * (default retryMaxAttempts) behavior every HR/Markom/CRM/webhook call uses.
   */
  maxAttempts?: number;
}

export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIGenerateResponse {
  text: string;
  tokensUsed?: AITokenUsage;
  provider: AIProviderName;
  model: string;
  responseTimeMs: number;
}

/**
 * Every module that needs AI (HR/Markom/CRM) calls through this interface —
 * resolved once via lib/ai/service.ts's getAIProvider(). No module imports a
 * concrete provider directly.
 */
export interface AIProvider {
  readonly name: AIProviderName;
  generate(request: AIGenerateRequest): Promise<AIGenerateResponse>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}
