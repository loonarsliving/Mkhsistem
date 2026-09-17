import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConnectorType = "whatsapp" | "meta" | "villa";
export type IntegrationDirection = "outgoing" | "incoming";

export interface IntegrationLogEntry {
  connector: ConnectorType;
  direction: IntegrationDirection;
  payload: unknown;
  status: "success" | "error";
  responseStatus?: number;
  error?: string;
  latencyMs?: number;
}

/**
 * One row per request that crosses a connector boundary, in either
 * direction — backs the AI Connector Layer's telemetry (last webhook/
 * incoming/outgoing/latency/error). Ported concept from Aiagent's
 * Repository.saveIntegrationLog; storage is a plain Supabase table here
 * (ai_integration_logs, see supabase/migrations/0063_ai_operating_system.sql)
 * instead of a generic Repository abstraction, since MK Connect has exactly
 * one persistence backend.
 */
export async function saveIntegrationLog(entry: IntegrationLogEntry): Promise<void> {
  const supabase = createAdminClient();
  // `connector: entry.connector as never` -- 'villa' is only a valid value
  // once migration 0268 (Loonars AI Occupancy Ads) is applied to the live
  // database and types/database.types.ts is regenerated (see that
  // migration's header); types/database.types.ts still only knows
  // 'whatsapp' | 'meta' until then. Narrow, mechanical cast for exactly
  // that gap -- remove once the migration lands and types regenerate.
  const { error } = await supabase.from("ai_integration_logs").insert({
    connector: entry.connector as never,
    direction: entry.direction,
    payload: entry.payload as never,
    status: entry.status,
    response_status: entry.responseStatus ?? null,
    error: entry.error ?? null,
    latency_ms: entry.latencyMs ?? null,
  });
  if (error) {
    // Logging must never break the caller's actual send/receive path.
    logger.error("saveIntegrationLog failed", { error: error.message });
  }
}
