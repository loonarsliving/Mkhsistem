import { logger } from "@/lib/logger";

import { AIProviderError } from "./errors";
import type { GeminiClientLike } from "./gemini-client";
import type { AIGenerateRequest, AIGenerateResponse, AIProvider } from "./types";

export interface GeminiProviderOptions {
  model: string;
  defaultTemperature: number;
  defaultMaxOutputTokens: number;
  timeoutMs: number;
  /** Applied to every harm category. */
  safetyThreshold: string;
}

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
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;

  constructor(
    private readonly client: GeminiClientLike,
    private readonly options: GeminiProviderOptions,
  ) {}

  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const startedAt = Date.now();
    const timeoutMs = this.options.timeoutMs;

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new AIProviderError(`Gemini call timed out after ${timeoutMs}ms`, "gemini", true)),
        timeoutMs,
      );
    });

    const config: NonNullable<Parameters<GeminiClientLike["models"]["generateContent"]>[0]["config"]> = {
      temperature: request.temperature ?? this.options.defaultTemperature,
      maxOutputTokens: request.maxOutputTokens ?? this.options.defaultMaxOutputTokens,
      systemInstruction: request.systemPrompt,
      responseMimeType: request.responseFormat === "json" ? "application/json" : undefined,
      thinkingConfig: { thinkingBudget: 0 },
    };
    (config as Record<string, unknown>).safetySettings = HARM_CATEGORIES.map((category) => ({
      category,
      threshold: this.options.safetyThreshold,
    }));

    try {
      const response = await Promise.race([
        this.client.models.generateContent({ model: this.options.model, contents: request.userPrompt, config }),
        timeoutPromise,
      ]);

      const text = response.text ?? "";
      const usage = response.usageMetadata;

      logger.info("gemini generate() succeeded", {
        model: this.options.model,
        responseTimeMs: Date.now() - startedAt,
        promptTokens: usage?.promptTokenCount,
        completionTokens: usage?.candidatesTokenCount,
      });

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
        responseTimeMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error("gemini generate() failed", { model: this.options.model, error: message });
      throw new AIProviderError(`Gemini generate() failed: ${message}`, "gemini", true, err);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await this.generate({
        systemPrompt: "You are a health check probe. Reply with exactly one word.",
        userPrompt: "Reply with exactly: OK",
        maxOutputTokens: 64,
        temperature: 0,
      });
      const ok = res.text.trim().length > 0;
      return { ok, detail: `model=${this.options.model} responseTimeMs=${res.responseTimeMs} text="${res.text.trim().slice(0, 40)}"` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
