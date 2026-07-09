"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { getCurrentSession, requirePermission } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveErrorLog } from "@/repositories/monitoring.repository";
import {
  reportClientErrorSchema,
  reportPerformanceMetricSchema,
  type ReportClientErrorInput,
  type ReportPerformanceMetricInput,
} from "@/features/monitoring/schemas/monitoring.schema";
import type { Json } from "@/types/database.types";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

/**
 * Records a client-side error. Deliberately does not require a session —
 * errors on the login page or before hydration finishes still need to be
 * captured — so it writes through the service-role client rather than
 * relying on an RLS insert policy.
 */
export async function reportClientErrorAction(input: ReportClientErrorInput): Promise<ActionResult> {
  const parsed = reportClientErrorSchema.safeParse(input);
  if (!parsed.success) return actionError("Payload error tidak valid");

  const session = await getCurrentSession();
  logger.error(parsed.data.message, { source: "client", url: parsed.data.url, userId: session?.userId });

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("mkc_error_logs").insert({
      level: parsed.data.level,
      source: "client",
      message: parsed.data.message,
      stack: parsed.data.stack,
      digest: parsed.data.digest,
      context: (parsed.data.context ?? {}) as Json,
      url: parsed.data.url,
      user_id: session?.userId,
      environment: process.env.NODE_ENV ?? "production",
    });
    if (error) throw error;
    return actionSuccess();
  } catch (err) {
    logger.error("Failed to persist client error log", { error: err instanceof Error ? err.message : String(err) });
    return actionError("Gagal mencatat error");
  }
}

export async function reportPerformanceMetricAction(input: ReportPerformanceMetricInput): Promise<ActionResult> {
  const parsed = reportPerformanceMetricSchema.safeParse(input);
  if (!parsed.success) return actionError("Payload metrik tidak valid");

  const session = await getCurrentSession();

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("mkc_performance_metrics").insert({
      metric_name: parsed.data.metricName,
      value: parsed.data.value,
      rating: parsed.data.rating,
      url: parsed.data.url,
      user_id: session?.userId,
      environment: process.env.NODE_ENV ?? "production",
    });
    if (error) throw error;
    return actionSuccess();
  } catch (err) {
    logger.error("Failed to persist performance metric", { error: err instanceof Error ? err.message : String(err) });
    return actionError("Gagal mencatat metrik");
  }
}

export async function resolveErrorLogAction(id: string): Promise<ActionResult> {
  const session = await requirePermission("system.monitoring_view");
  const supabase = await createClient();
  try {
    await resolveErrorLog(supabase, id, session.userId);
    revalidatePath("/monitoring");
    return actionSuccess();
  } catch {
    return actionError("Gagal menandai error sebagai selesai");
  }
}
