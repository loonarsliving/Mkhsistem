import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

const PROVIDER = "gemini";
const OPEN_COOLDOWN_MS = Number(process.env.AI_CIRCUIT_OPEN_COOLDOWN_MS ?? "60000");
const FAILURE_THRESHOLD = Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD ?? "5");

export interface CircuitBreakerStatus {
  allowed: boolean;
  state: "closed" | "open" | "half_open";
  consecutiveFailures: number;
}

/**
 * Shared circuit breaker, backed by ai_circuit_breaker_state (Supabase) —
 * in-memory state cannot work here since concurrent requests (up to ~500
 * simultaneous employees) land on separate, independent Vercel serverless
 * instances that share nothing in memory. State transitions happen inside
 * the ai_circuit_breaker_check/report SECURITY DEFINER functions, which
 * row-lock (`for update`) so concurrent callers can't race each other into
 * an inconsistent state.
 *
 * If the check itself fails (e.g. a transient DB hiccup unrelated to
 * Gemini), this fails OPEN — i.e. allows the call — deliberately: a broken
 * circuit breaker must never become a second way for the whole AI feature
 * to go down. The per-call retry/timeout logic (gemini-retry.ts) is still
 * there as the real safety net in that case.
 */
export async function checkCircuitBreaker(): Promise<CircuitBreakerStatus> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("ai_circuit_breaker_check", {
      p_provider: PROVIDER,
      p_open_cooldown_ms: OPEN_COOLDOWN_MS,
    });
    if (error || !data) {
      logger.error("circuit breaker check failed -- failing open (allowing the call)", { error: error?.message });
      return { allowed: true, state: "closed", consecutiveFailures: 0 };
    }
    const result = data as { allowed: boolean; state: string; consecutive_failures: number };
    return { allowed: result.allowed, state: result.state as CircuitBreakerStatus["state"], consecutiveFailures: result.consecutive_failures };
  } catch (err) {
    logger.error("circuit breaker check threw -- failing open (allowing the call)", { error: err instanceof Error ? err.message : String(err) });
    return { allowed: true, state: "closed", consecutiveFailures: 0 };
  }
}

/** Records one call's outcome. Never throws — a failure here must not mask or replace the caller's own success/failure result. */
export async function reportCircuitBreakerOutcome(success: boolean): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("ai_circuit_breaker_report", {
      p_provider: PROVIDER,
      p_success: success,
      p_failure_threshold: FAILURE_THRESHOLD,
    });
    if (error) logger.error("circuit breaker report failed", { error: error.message });
  } catch (err) {
    logger.error("circuit breaker report threw", { error: err instanceof Error ? err.message : String(err) });
  }
}
