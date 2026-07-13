import type { AIProviderName } from "./types";

/**
 * Ported from Aiagent (packages/ai-provider/src/errors.ts). Every AI provider
 * failure — network, timeout, malformed response — surfaces as this one
 * structured error; `retryable` tells the caller whether retrying is worthwhile.
 */
export class AIProviderError extends Error {
  readonly provider: AIProviderName;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, provider: AIProviderName, retryable: boolean, cause?: unknown) {
    super(message);
    this.name = "AIProviderError";
    this.provider = provider;
    this.retryable = retryable;
    this.cause = cause;
  }
}
