import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withGeminiRetry } from "@/lib/ai/provider/gemini-retry";
import { AIProviderError } from "@/lib/ai/provider/errors";

function googleError(code: number, status: string, retryDelay?: string): Error {
  return new Error(
    JSON.stringify({
      error: {
        code,
        message: `simulated ${status}`,
        status,
        ...(retryDelay ? { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }] } : {}),
      },
    }),
  );
}

describe("withGeminiRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function runWithFakeTimers<T>(promise: Promise<T>): Promise<T> {
    // Every sleep() in the retry loop is backed by a real setTimeout; letting
    // fake timers advance in a loop lets each one resolve without the test
    // actually waiting 20/40/80 real seconds.
    let settled = false;
    // .then(onFulfilled, onRejected) -- not .finally() -- is what actually
    // marks the rejection as handled to Node, avoiding a false-positive
    // "unhandled rejection" report for the rejection cases below, which are
    // deliberately expected and re-observed via the returned `promise`.
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    while (!settled) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    return promise;
  }

  it("returns the result on the first attempt with no retry", async () => {
    const attemptFn = vi.fn().mockResolvedValue("ok");

    const result = await runWithFakeTimers(withGeminiRetry({ model: "gemini-flash-latest", maxAttempts: 4, baseDelayMs: 20_000 }, attemptFn));

    expect(result).toBe("ok");
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 and succeeds on the second attempt", async () => {
    const attemptFn = vi
      .fn()
      .mockRejectedValueOnce(googleError(503, "UNAVAILABLE"))
      .mockResolvedValueOnce("recovered");

    const result = await runWithFakeTimers(withGeminiRetry({ model: "gemini-flash-latest", maxAttempts: 4, baseDelayMs: 20_000 }, attemptFn));

    expect(result).toBe("recovered");
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  it("retries 429/500/502/503/504 and gives up only after every attempt is exhausted", async () => {
    const attemptFn = vi.fn().mockRejectedValue(googleError(503, "UNAVAILABLE"));

    await expect(runWithFakeTimers(withGeminiRetry({ model: "gemini-flash-latest", maxAttempts: 4, baseDelayMs: 20_000 }, attemptFn))).rejects.toThrow(
      /simulated UNAVAILABLE|UNAVAILABLE/,
    );
    expect(attemptFn).toHaveBeenCalledTimes(4);
  });

  it.each([429, 500, 502, 503, 504])("treats HTTP %i as retryable", async (code) => {
    const attemptFn = vi.fn().mockRejectedValueOnce(googleError(code, "X")).mockResolvedValueOnce("ok");
    const result = await runWithFakeTimers(withGeminiRetry({ model: "gemini-flash-latest", maxAttempts: 4, baseDelayMs: 20_000 }, attemptFn));
    expect(result).toBe("ok");
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  it("fails immediately on 404 model-not-found without retrying, marked non-retryable", async () => {
    const attemptFn = vi.fn().mockRejectedValue(googleError(404, "NOT_FOUND"));

    await expect(
      withGeminiRetry({ model: "gemini-nonexistent-model", maxAttempts: 4, baseDelayMs: 20_000 }, attemptFn),
    ).rejects.toMatchObject({ retryable: false, httpStatus: 404 });
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on a non-retryable status (400), marked non-retryable -- a caller like the async job queue must never reschedule this", async () => {
    const attemptFn = vi.fn().mockRejectedValue(googleError(400, "INVALID_ARGUMENT"));

    await expect(
      withGeminiRetry({ model: "gemini-flash-latest", maxAttempts: 4, baseDelayMs: 20_000 }, attemptFn),
    ).rejects.toMatchObject({ retryable: false, httpStatus: 400 });
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it("treats an unparseable/timeout error as retryable", async () => {
    const timeoutErr = new AIProviderError("Gemini call timed out after 20000ms", "gemini", true);
    const attemptFn = vi.fn().mockRejectedValueOnce(timeoutErr).mockResolvedValueOnce("ok");

    const result = await runWithFakeTimers(withGeminiRetry({ model: "gemini-flash-latest", maxAttempts: 4, baseDelayMs: 20_000 }, attemptFn));
    expect(result).toBe("ok");
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  it("respects a Retry-After hint from a 429's RetryInfo detail instead of the computed backoff", async () => {
    const attemptFn = vi.fn().mockRejectedValueOnce(googleError(429, "RESOURCE_EXHAUSTED", "5s")).mockResolvedValueOnce("ok");

    const promise = withGeminiRetry({ model: "gemini-flash-latest", maxAttempts: 4, baseDelayMs: 20_000 }, attemptFn);

    // Advancing by less than the 20s default backoff but past the 5s
    // Retry-After hint should already be enough for the second attempt to fire.
    await vi.advanceTimersByTimeAsync(6_000);
    const result = await promise;

    expect(result).toBe("ok");
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });

  it("marks exhaustedRetries on the final AIProviderError once every attempt is used", async () => {
    const timeoutErr = () => new AIProviderError("Gemini call timed out after 20000ms", "gemini", true);
    const attemptFn = vi.fn().mockRejectedValue(timeoutErr());

    await expect(runWithFakeTimers(withGeminiRetry({ model: "gemini-flash-latest", maxAttempts: 2, baseDelayMs: 20_000 }, attemptFn))).rejects.toMatchObject(
      { exhaustedRetries: true },
    );
    expect(attemptFn).toHaveBeenCalledTimes(2);
  });
});
