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
  /** Enables Gemini's Google Search grounding tool for this call (real-time web research, e.g. Markom's viral-trend/competitor-ad checklist generation) -- not on by default since it adds latency/cost every other domain call doesn't need. */
  useWebSearch?: boolean;
  /** Attaches an image to the prompt (Gemini multimodal vision) -- e.g. reviewing an uploaded content photo against its brief. base64-encoded bytes, no data: URI prefix. */
  image?: { data: string; mimeType: string };
  /** Attaches several labeled images to the prompt (Gemini multimodal vision) -- e.g. letting the AI actually look at every candidate photo before picking which to use in an ad and writing copy grounded in what's really shown, instead of only reading a caption. `id` is echoed back as a text label immediately before each image so the model can refer to "the photo labeled X" and the caller can tell which inlineData part is which. base64-encoded bytes, no data: URI prefix. Independent of `image` -- a caller may set one or the other, never both. */
  images?: { id: string; data: string; mimeType: string }[];
  /** Attaches a video to the prompt (Gemini multimodal video understanding -- Gemini genuinely watches/analyzes frames+audio, not just a caption) -- e.g. reviewing an uploaded Content Studio video against its brief. base64-encoded bytes, no data: URI prefix. Sent inline (not via the Files API), so only safe for videos under ~20MB -- callers must check size themselves and fall back to a caption-only prompt for anything larger. */
  video?: { data: string; mimeType: string };
  /**
   * Overrides AI_CONFIG.retryMaxAttempts for this one call — every call still
   * goes through the same centralized retry wrapper, this only changes how
   * many attempts it's allowed. healthCheck() passes 1 here so a routine
   * probe never burns a full 429/503 backoff sequence; omit for the normal
   * (default retryMaxAttempts) behavior every HR/Markom/CRM/webhook call uses.
   */
  maxAttempts?: number;
  /** Links every telemetry row this call produces (ai_request_telemetry) back to its ai_job_queue row — set only by the async job processor, omitted for direct/synchronous callers (HR/Markom/CRM dashboard actions). */
  jobId?: string;
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
