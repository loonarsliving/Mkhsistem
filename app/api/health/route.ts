import { NextResponse } from "next/server";

import packageJson from "@/package.json";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness/readiness probe for uptime monitors, load
 * balancers, and Vercel's own health checks. Performs a real database
 * round-trip via `health_check()` (granted to anon, returns no application
 * data) so a degraded database is reflected in the response, not just "the
 * Next.js process is alive."
 */
export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, { status: "ok" | "down"; latencyMs?: number; error?: string }> = {};

  try {
    const supabase = await createClient();
    const dbStart = Date.now();
    const { error } = await supabase.rpc("health_check");
    if (error) throw error;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: "down", error: err instanceof Error ? err.message : "unknown error" };
    logger.error("Health check database probe failed", { error: checks.database.error });
  }

  const allOk = Object.values(checks).every((check) => check.status === "ok");

  const body = {
    status: allOk ? "ok" : "degraded",
    version: packageJson.version,
    environment: process.env.NODE_ENV ?? "production",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    latencyMs: Date.now() - startedAt,
    checks,
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
