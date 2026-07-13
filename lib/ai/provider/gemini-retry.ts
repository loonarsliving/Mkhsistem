import { logger } from "@/lib/logger";

import { AIProviderError } from "./errors";

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

interface ParsedGeminiFailure {
  httpStatus: number | null;
  statusText: string | null;
  retryAfterMs: number | null;
  errorBody: string;
}

function safeTruncate(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Best-effort parse of a thrown Gemini/SDK error into an HTTP status +
 * Retry-After hint. Google's REST API (and @google/genai, which surfaces the
 * raw body as Error.message) uses one consistent envelope for HTTP-shaped
 * failures — {"error":{"code":503,"message":"...","status":"UNAVAILABLE",
 * "details":[{"retryDelay":"20s",...}]}} — confirmed against a real
 * production 503. Anything that doesn't parse as that envelope (a timeout,
 * a network-level error, an unrecognized SDK error shape) resolves to
 * httpStatus: null and is treated as retryable by the caller — deliberate,
 * since a timeout or transient network failure is exactly as retryable as a
 * 503, and there is no fixed enumerable set of non-HTTP transient failures
 * to special-case here.
 */
function parseGeminiFailure(err: unknown): ParsedGeminiFailure {
  const message = err instanceof Error ? err.message : String(err);

  let httpStatus: number | null = null;
  let statusText: string | null = null;
  let retryAfterMs: number | null = null;

  try {
    const parsed = JSON.parse(message) as { error?: { code?: number; status?: string; details?: unknown[] } };
    if (parsed?.error) {
      httpStatus = typeof parsed.error.code === "number" ? parsed.error.code : null;
      statusText = typeof parsed.error.status === "string" ? parsed.error.status : null;
      if (Array.isArray(parsed.error.details)) {
        for (const detail of parsed.error.details) {
          const retryDelay = (detail as Record<string, unknown>)?.retryDelay;
          if (typeof retryDelay === "string") {
            // Google's RetryInfo proto duration format: "20s", "1.500s"
            const match = /^(\d+(?:\.\d+)?)s$/.exec(retryDelay);
            if (match) retryAfterMs = Math.round(parseFloat(match[1]) * 1000);
          }
        }
      }
    }
  } catch {
    // message wasn't the JSON error envelope -- fall through to the
    // structural fallback below (covers SDK versions that attach status
    // differently, e.g. a plain numeric .status/.code property).
  }

  if (httpStatus === null) {
    const asRecord = err as Record<string, unknown> | null;
    const candidate = asRecord?.status ?? asRecord?.code ?? (asRecord?.response as Record<string, unknown> | undefined)?.status;
    if (typeof candidate === "number") httpStatus = candidate;
  }

  return { httpStatus, statusText, retryAfterMs, errorBody: safeTruncate(message) };
}

function computeBackoffMs(baseDelayMs: number, failedAttempt: number): number {
  const raw = baseDelayMs * Math.pow(2, failedAttempt - 1); // attempt 1->base, 2->2*base, 3->4*base (20s/40s/80s at the default 20s base)
  const jitterFactor = 0.8 + Math.random() * 0.4; // +/-20% jitter, so concurrent requests don't retry in lockstep
  return Math.round(raw * jitterFactor);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GeminiRetryOptions {
  model: string;
  maxAttempts: number;
  baseDelayMs: number;
}

/**
 * The ONE centralized retry layer every Gemini request goes through — called
 * only from GeminiProvider.generate() (the sole generateContent() call site
 * in the codebase; grep for "generateContent(" confirms this). Retries
 * 429/500/502/503/504 and unparseable/timeout failures with exponential
 * backoff + jitter (default 20s/40s/80s before attempts 2/3/4, each
 * independently overridable via GEMINI_RETRY_MAX_ATTEMPTS/
 * GEMINI_RETRY_BASE_DELAY_MS). A 429's Retry-After (parsed from Google's
 * RetryInfo error detail) takes priority over the computed backoff when
 * present. A 404 (model not found) fails immediately without consuming a
 * retry attempt, and logs the configured model name so a renamed or
 * deprecated model is obvious from the logs alone rather than looking like a
 * generic outage.
 */
export async function withGeminiRetry<T>(options: GeminiRetryOptions, attemptFn: (attempt: number) => Promise<T>): Promise<T> {
  const { model, maxAttempts, baseDelayMs } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await attemptFn(attempt);
      logger.info("gemini request succeeded", {
        model,
        attempt,
        maxAttempts,
        responseTimeMs: Date.now() - startedAt,
        outcome: "success",
      });
      return result;
    } catch (err) {
      const responseTimeMs = Date.now() - startedAt;
      const parsed = parseGeminiFailure(err);

      const isModelNotFound = parsed.httpStatus === 404 || parsed.statusText === "NOT_FOUND";
      const isRetryableStatus = parsed.httpStatus !== null && RETRYABLE_HTTP_STATUSES.has(parsed.httpStatus);
      // No parseable HTTP status (timeout, network error, unrecognized SDK
      // error shape) is treated as retryable too -- only a recognized,
      // non-retryable HTTP status (400/401/403/404/...) stops early.
      const retryable = !isModelNotFound && (isRetryableStatus || parsed.httpStatus === null);
      const isLastAttempt = attempt === maxAttempts;
      const willRetry = retryable && !isLastAttempt;

      logger.error("gemini request failed", {
        model,
        attempt,
        maxAttempts,
        httpStatus: parsed.httpStatus,
        errorBody: parsed.errorBody,
        responseTimeMs,
        willRetry,
        outcome: isModelNotFound ? "model_not_found" : willRetry ? "retrying" : "failed_final",
      });

      lastError = err;

      if (isModelNotFound) {
        logger.error("Gemini model not found -- check GEMINI_MODEL", { configuredModel: model });
        throw err;
      }
      if (!willRetry) {
        if (err instanceof AIProviderError) err.exhaustedRetries = isLastAttempt && retryable;
        throw err;
      }

      const waitMs = parsed.retryAfterMs ?? computeBackoffMs(baseDelayMs, attempt);
      logger.info("gemini retry scheduled", {
        model,
        nextAttempt: attempt + 1,
        maxAttempts,
        waitMs,
        source: parsed.retryAfterMs !== null ? "retry-after" : "backoff",
      });
      await sleep(waitMs);
    }
  }

  throw lastError;
}
