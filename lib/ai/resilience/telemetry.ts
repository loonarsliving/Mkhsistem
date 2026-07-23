import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export interface TelemetryRecord {
  provider: string;
  model: string;
  jobId?: string | null;
  attempt: number;
  maxAttempts: number;
  httpStatus: number | null;
  errorBody?: string | null;
  waitMs?: number | null;
  responseTimeMs: number;
  outcome: "success" | "retrying" | "failed_final" | "model_not_found" | "circuit_open";
  circuitState?: string | null;
}

/**
 * Durable, directly queryable per-attempt telemetry (ai_request_telemetry)
 * — every Gemini call attempt gets one row, regardless of outcome. Kept
 * separate from Vercel's own request logs since those have proven
 * unreliable to access on demand during past incidents in this project;
 * this is always reachable via a plain SQL query. Never throws — a
 * telemetry write failure must never affect the actual AI call's result.
 */
export async function recordTelemetry(record: TelemetryRecord): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("ai_request_telemetry").insert({
      provider: record.provider,
      model: record.model,
      job_id: record.jobId ?? null,
      attempt: record.attempt,
      max_attempts: record.maxAttempts,
      http_status: record.httpStatus,
      error_body: record.errorBody ?? null,
      wait_ms: record.waitMs ?? null,
      response_time_ms: record.responseTimeMs,
      outcome: record.outcome,
      circuit_state: record.circuitState ?? null,
    });
    if (error) logger.error("ai_request_telemetry insert failed", { error: error.message });
  } catch (err) {
    logger.error("ai_request_telemetry insert threw", { error: err instanceof Error ? err.message : String(err) });
  }
}
