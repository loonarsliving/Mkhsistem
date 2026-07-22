import { checkCircuitBreaker, reportCircuitBreakerOutcome } from "../resilience/circuit-breaker";
import { recordTelemetry } from "../resilience/telemetry";
import { AIProviderError } from "./errors";
import type { GeminiClientLike } from "./gemini-client";
import { withGeminiRetry } from "./gemini-retry";
import type { AIGenerateRequest, AIGenerateResponse, AIProvider } from "./types";

export interface GeminiProviderOptions {
  model: string;
  defaultTemperature: number;
  defaultMaxOutputTokens: number;
  timeoutMs: number;
  /** Applied to every harm category. */
  safetyThreshold: string;
  /** Default retry budget for generate() calls that don't override AIGenerateRequest.maxAttempts (see withGeminiRetry). */
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
}

type GenerateContentConfig = NonNullable<Parameters<GeminiClientLike["models"]["generateContent"]>[0]["config"]>;
type GenerateContentResult = Awaited<ReturnType<GeminiClientLike["models"]["generateContent"]>>;

const HARM_CATEGORIES = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
] as const;

/**
 * Real Gemini Flash implementation. Ported from Aiagent
 * (packages/ai-provider/src/providers/gemini.provider.ts) — the "thinking
 * budget 0" and safety-settings handling there were both fixed against a
 * live API during that project's Sprint 2, so they're kept verbatim here.
 *
 * Every call goes through withGeminiRetry (lib/ai/provider/gemini-retry.ts)
 * — this is the only place generateContent() is invoked in the codebase, so
 * there is no direct call anywhere that bypasses the retry layer.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;

  constructor(
    private readonly client: GeminiClientLike,
    private readonly options: GeminiProviderOptions,
  ) {}

  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const overallStartedAt = Date.now();
    const maxAttempts = request.maxAttempts ?? this.options.retryMaxAttempts;

    // Shared circuit breaker, checked before spending any quota on this
    // call: if Gemini has been failing consecutively across the whole
    // fleet (not just this request), skip straight to the fallback instead
    // of piling another doomed call on top of an outage — this is what
    // actually protects the provider and saves quota at high concurrency
    // (e.g. ~500 employees messaging at once), which per-request retries
    // alone cannot do since they have no visibility into each other.
    const breaker = await checkCircuitBreaker();
    if (!breaker.allowed) {
      await recordTelemetry({
        provider: "gemini",
        model: this.options.model,
        jobId: request.jobId,
        attempt: 0,
        maxAttempts,
        httpStatus: null,
        responseTimeMs: 0,
        outcome: "circuit_open",
        circuitState: breaker.state,
      });
      throw new AIProviderError(
        `Gemini circuit breaker is open (${breaker.consecutiveFailures} consecutive failures) -- skipping call to protect the provider`,
        "gemini",
        true,
      );
    }

    // Gemini rejects responseMimeType + the googleSearch tool together, so
    // callers requesting useWebSearch must not also set responseFormat:
    // "json" -- ask the model to return plain-text JSON and parse it
    // instead (see lib/ai/domains/markom.ts's researchAndGenerateChecklist).
    const config: GenerateContentConfig = {
      temperature: request.temperature ?? this.options.defaultTemperature,
      maxOutputTokens: request.maxOutputTokens ?? this.options.defaultMaxOutputTokens,
      systemInstruction: request.systemPrompt,
      responseMimeType: request.responseFormat === "json" ? "application/json" : undefined,
      // Gemini 3.x replaced the 2.x token-count "thinking_budget" with a
      // semantic "thinking_level" -- sending the old param to a 3.x model
      // is rejected in a way the API surfaces as a misleading 503 "high
      // demand" rather than a clean validation error. The SDK's ThinkingLevel
      // enum (node_modules/@google/genai/dist/genai.d.ts) is UPPERCASE --
      // "MINIMAL" is the 3.x equivalent of budget 0 (thinking effectively off).
      thinkingConfig: { thinkingLevel: "MINIMAL" },
      tools: request.useWebSearch ? [{ googleSearch: {} }] : undefined,
    };
    (config as Record<string, unknown>).safetySettings = HARM_CATEGORIES.map((category) => ({
      category,
      threshold: this.options.safetyThreshold,
    }));

    try {
      const response = await withGeminiRetry(
        {
          model: this.options.model,
          maxAttempts,
          baseDelayMs: this.options.retryBaseDelayMs,
          onAttempt: async (info) => {
            await Promise.all([
              recordTelemetry({
                provider: "gemini",
                model: this.options.model,
                jobId: request.jobId,
                attempt: info.attempt,
                maxAttempts: info.maxAttempts,
                httpStatus: info.httpStatus,
                errorBody: info.errorBody,
                waitMs: info.waitMs,
                responseTimeMs: info.responseTimeMs,
                outcome: info.outcome,
                circuitState: breaker.state,
              }),
              reportCircuitBreakerOutcome(info.outcome === "success"),
            ]);
          },
        },
        () => this.callOnce(request.userPrompt, request.image, request.video, config),
      );

      const text = response.text ?? "";
      const usage = response.usageMetadata;

      return {
        text,
        tokensUsed: usage
          ? {
              promptTokens: usage.promptTokenCount ?? 0,
              completionTokens: usage.candidatesTokenCount ?? 0,
              totalTokens: usage.totalTokenCount ?? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0),
            }
          : undefined,
        provider: "gemini",
        model: this.options.model,
        responseTimeMs: Date.now() - overallStartedAt,
      };
    } catch (err) {
      // withGeminiRetry already logged/recorded telemetry for every attempt
      // -- this is just the final surface to callers, always as one
      // AIProviderError regardless of whether the underlying failure was a
      // timeout (already an AIProviderError) or a raw Gemini API error (a
      // plain Error, wrapped here).
      if (err instanceof AIProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new AIProviderError(`Gemini generate() failed after retries: ${message}`, "gemini", true, err);
    }
  }

  /**
   * One raw attempt: per-attempt timeout race + the actual API call.
   * Deliberately does not catch/wrap errors — withGeminiRetry's failure
   * parser needs the SDK's real error shape (e.g. the {"error":{"code":503,
   * ...}} envelope) to classify retryability; wrapping it here would hide
   * that from the retry layer.
   */
  private async callOnce(
    userPrompt: string,
    image: AIGenerateRequest["image"],
    video: AIGenerateRequest["video"],
    config: GenerateContentConfig,
  ): Promise<GenerateContentResult> {
    const timeoutMs = this.options.timeoutMs;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new AIProviderError(`Gemini call timed out after ${timeoutMs}ms`, "gemini", true)),
        timeoutMs,
      );
    });

    // Multimodal (vision) shape only when an image/video is attached --
    // every other call keeps sending contents as a plain string, unchanged.
    // image and video are never both set by any caller today (a review is
    // either a photo or a video, never both), but if they were, Gemini
    // happily accepts multiple inlineData parts in one turn.
    const mediaParts = [
      image ? { inlineData: { mimeType: image.mimeType, data: image.data } } : null,
      video ? { inlineData: { mimeType: video.mimeType, data: video.data } } : null,
    ].filter((part): part is { inlineData: { mimeType: string; data: string } } => part !== null);
    const contents = mediaParts.length > 0 ? [{ role: "user" as const, parts: [{ text: userPrompt }, ...mediaParts] }] : userPrompt;

    try {
      return await Promise.race([
        this.client.models.generateContent({ model: this.options.model, contents, config }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  /**
   * maxAttempts: 1 — a health probe is not worth a full 429/503 backoff
   * sequence (up to 140s+); still goes through the same withGeminiRetry
   * layer (via generate()), just configured for a single attempt. Caching
   * successful results is the caller's job (lib/ai/service.ts's
   * aiHealthCheck()), not this method's — this always performs a real call
   * when invoked.
   */
  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await this.generate({
        systemPrompt: "You are a health check probe. Reply with exactly one word.",
        userPrompt: "Reply with exactly: OK",
        maxOutputTokens: 64,
        temperature: 0,
        maxAttempts: 1,
      });
      const ok = res.text.trim().length > 0;
      return { ok, detail: `model=${this.options.model} responseTimeMs=${res.responseTimeMs} text="${res.text.trim().slice(0, 40)}"` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
