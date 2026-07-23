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

/** Exported so the async job queue (app/api/ai/process-job/route.ts) can schedule next_attempt_at with the exact same 20s/40s/80s formula instead of an in-process sleep, for jobs where backoff must span separate invocations to avoid a serverless function timeout. */
export function computeBackoffMs(baseDelayMs: number, failedAttempt: number): number {
  const raw = baseDelayMs * Math.pow(2, failedAttempt - 1); // attempt 1->base, 2->2*base, 3->4*base (20s/40s/80s at the default 20s base)
  const jitterFactor = 0.8 + Math.random() * 0.4; // +/-20% jitter, so concurrent requests don't retry in lockstep
  return Math.round(raw * jitterFactor);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GeminiRetryAttemptInfo {
  attempt: number;
  maxAttempts: number;
  httpStatus: number | null;
  errorBody: string | null;
  waitMs: number | null;
  responseTimeMs: number;
  outcome: "success" | "retrying" | "failed_final" | "model_not_found";
}

export interface GeminiRetryOptions {
  model: string;
  maxAttempts: number;
  baseDelayMs: number;
  /**
   * Called once per attempt (success or failure), before any retry wait.
   * Deliberately optional and side-effect-free from this module's own
   * perspective — lets a caller (GeminiProvider) record telemetry/circuit-
   * breaker state in the database without this module depending on one,
   * which keeps it unit-testable with plain fake timers (see
   * tests/unit/lib/gemini-retry.test.ts).
   */
  onAttempt?: (info: GeminiRetryAttemptInfo) => void | Promise<void>;
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
  const { model, maxAttempts, baseDelayMs, onAttempt } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await attemptFn(attempt);
      const responseTimeMs = Date.now() - startedAt;
      logger.info("gemini request succeeded", { model, attempt, maxAttempts, responseTimeMs, outcome: "success" });
      await onAttempt?.({ attempt, maxAttempts, httpStatus: null, errorBody: null, waitMs: null, responseTimeMs, outcome: "success" });
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
      const waitMs = willRetry ? (parsed.retryAfterMs ?? computeBackoffMs(baseDelayMs, attempt)) : null;
      const outcome = isModelNotFound ? "model_not_found" : willRetry ? "retrying" : "failed_final";

      logger.error("gemini request failed", {
        model,
        attempt,
        maxAttempts,
        httpStatus: parsed.httpStatus,
        errorBody: parsed.errorBody,
        responseTimeMs,
        willRetry,
        outcome,
      });
      await onAttempt?.({ attempt, maxAttempts, httpStatus: parsed.httpStatus, errorBody: parsed.errorBody, waitMs, responseTimeMs, outcome });

      if (isModelNotFound) {
        logger.error("Gemini model not found -- check GEMINI_MODEL", { configuredModel: model });
        // Wrapped here (not the raw SDK error) so retryable is accurately
        // false all the way up the call chain -- a caller that only sees
        // "an AIProviderError was thrown" (e.g. the async job queue
        // deciding whether to reschedule vs. dead-letter) needs .retryable
        // to reflect the real classification, not a blanket "true" applied
        // later by a generic wrap that no longer has this context.
        const notFoundErr = new AIProviderError(`Gemini model not found: ${parsed.errorBody}`, "gemini", false, err, parsed.httpStatus);
        lastError = notFoundErr;
        throw notFoundErr;
      }
      if (!willRetry) {
        // retryable === false here means a genuinely non-retryable HTTP
        // status (400/401/403/...); retryable === true means every attempt
        // was used up on an inherently-retryable failure -- both need to
        // surface that distinction accurately, not as a uniform "true".
        const finalErr =
          err instanceof AIProviderError
            ? err
            : new AIProviderError(parsed.errorBody, "gemini", retryable, err, parsed.httpStatus);
        finalErr.exhaustedRetries = isLastAttempt && retryable;
        lastError = finalErr;
        throw finalErr;
      }

      lastError = err;

      logger.info("gemini retry scheduled", {
        model,
        nextAttempt: attempt + 1,
        maxAttempts,
        waitMs,
        source: parsed.retryAfterMs !== null ? "retry-after" : "backoff",
      });
      await sleep(waitMs as number);
    }
  }

  throw lastError;
}
