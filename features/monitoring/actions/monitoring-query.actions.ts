"use server";

import { whatsAppHealthCheck } from "@/lib/ai/notifications/engine";
import { aiHealthCheck } from "@/lib/ai/service";
import { metaHealthCheck } from "@/lib/meta/client";
import { requirePermission } from "@/lib/rbac/session";
import { tiktokHealthCheck } from "@/lib/social/tiktok";
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

export async function getAiHealthStatusAction() {
  await requirePermission("system.monitoring_view");
  return aiHealthCheck();
}

export async function getWhatsAppHealthStatusAction() {
  await requirePermission("system.monitoring_view");
  return whatsAppHealthCheck();
}

export async function getMetaHealthStatusAction() {
  await requirePermission("system.monitoring_view");
  return metaHealthCheck();
}

export async function getTikTokHealthStatusAction() {
  await requirePermission("system.monitoring_view");
  return tiktokHealthCheck();
}
