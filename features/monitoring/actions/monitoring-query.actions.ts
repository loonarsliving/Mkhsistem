"use server";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getPerformanceSummary, listErrorLogs } from "@/repositories/monitoring.repository";

export async function listErrorLogsAction(page: number, resolvedFilter?: boolean) {
  await requirePermission("system.monitoring_view");
  const supabase = await createClient();
  return listErrorLogs(supabase, page, resolvedFilter);
}

export async function getPerformanceSummaryAction() {
  await requirePermission("system.monitoring_view");
  const supabase = await createClient();
  return getPerformanceSummary(supabase);
}

export async function getHealthStatusAction() {
  await requirePermission("system.monitoring_view");
  const supabase = await createClient();
  const startedAt = Date.now();
  const { error } = await supabase.rpc("health_check");
  return { ok: !error, latencyMs: Date.now() - startedAt };
}
