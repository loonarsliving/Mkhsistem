import type { AIProviderName } from "./types";

/**
 * Ported from Aiagent (packages/ai-provider/src/errors.ts). Every AI provider
 * failure — network, timeout, malformed response — surfaces as this one
 * structured error; `retryable` tells the caller whether retrying is worthwhile.
 *
 * `httpStatus` is populated when the failure came from a parsed HTTP-shaped
 * provider response (e.g. Gemini's `{"error":{"code":503,...}}`) — null for
 * a timeout or a failure whose shape couldn't be parsed. `exhaustedRetries`
 * is set by the retry wrapper (lib/ai/provider/gemini-retry.ts) on the final
 * error once every attempt has been used, so callers can distinguish "gave
 * up after retrying" from "failed immediately" (e.g. model-not-found).
 */
export class AIProviderError extends Error {
  readonly provider: AIProviderName;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly httpStatus: number | null;
  exhaustedRetries: boolean;

  constructor(message: string, provider: AIProviderName, retryable: boolean, cause?: unknown, httpStatus: number | null = null) {
    super(message);
    this.name = "AIProviderError";
    this.provider = provider;
    this.retryable = retryable;
    this.cause = cause;
    this.httpStatus = httpStatus;
    this.exhaustedRetries = false;
  }
}
