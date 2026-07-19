"use server";

import { revalidatePath } from "next/cache";

import { draftLoonarsFaqReply, generateLoonarsContentIdeas } from "@/lib/ai/domains/loonars-beauty";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  createContentItem,
  createOrder,
  getLatestCompetitorComparison,
  getLatestWeeklyEvaluation,
  getOrderStats,
  listContentItems,
  listContentMetrics,
  listOrders,
  listRecentMetricsForPublishedContent,
  softDeleteContentItem,
  updateContentItem,
  updateOrderStatus,
  upsertContentMetric,
} from "@/repositories/loonars-beauty.repository";
import { listRecentAccountSnapshots } from "@/repositories/social.repository";
import type { Tables } from "@/types/database.types";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  createContentItemSchema,
  createOrderSchema,
  draftFaqReplySchema,
  generateContentIdeasSchema,
  logContentMetricsSchema,
  updateContentItemStatusSchema,
  updateOrderStatusSchema,
  type CreateContentItemInput,
  type CreateOrderInput,
  type DraftFaqReplyInput,
  type GenerateContentIdeasInput,
  type LogContentMetricsInput,
  type UpdateContentItemStatusInput,
  type UpdateOrderStatusInput,
} from "../schemas/loonars-beauty.schema";

/** Agreed rotation from the content strategy: 40% problem-solution / 30% UGC / 20% edukasi / 10% promosi. */
const RATIO_TARGET = { problem_solution: 40, ugc: 30, edukasi: 20, promosi: 10 } as const;
const CATEGORY_KEYS = Object.keys(RATIO_TARGET) as Array<keyof typeof RATIO_TARGET>;

type LoonarsContentCategory = Tables<"loonars_content_items">["category"];
type LoonarsContentStatus = Tables<"loonars_content_items">["status"];
type LoonarsOrderStatus = Tables<"loonars_orders">["status"];
type LoonarsOrderChannel = Tables<"loonars_orders">["channel"];

export async function listContentItemsAction(filters?: { category?: LoonarsContentCategory; status?: LoonarsContentStatus }) {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  return listContentItems(supabase, filters);
}

export async function createContentItemAction(input: CreateContentItemInput): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission("loonars_beauty.manage");
  const parsed = createContentItemSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    const created = await createContentItem(supabase, {
      category: parsed.data.category,
      platform: parsed.data.platform,
      title: parsed.data.title,
      hook: parsed.data.hook || null,
      caption: parsed.data.caption || null,
      script_notes: parsed.data.scriptNotes || null,
      cta: parsed.data.cta || null,
      created_by: session.userId,
      updated_by: session.userId,
    });
    revalidatePath("/loonars-beauty");
    return actionSuccess({ id: created.id });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan konten");
  }
}

export async function updateContentItemStatusAction(input: UpdateContentItemStatusInput): Promise<ActionResult> {
  const session = await requirePermission("loonars_beauty.manage");
  const parsed = updateContentItemStatusSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await updateContentItem(supabase, parsed.data.id, {
      status: parsed.data.status,
      content_url: parsed.data.contentUrl || null,
      published_at: parsed.data.status === "published" ? new Date().toISOString() : undefined,
      updated_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah status konten");
  }
  revalidatePath("/loonars-beauty");
  return actionSuccess();
}

export async function deleteContentItemAction(id: string): Promise<ActionResult> {
  await requirePermission("loonars_beauty.manage");
  const supabase = await createClient();
  try {
    await softDeleteContentItem(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus konten");
  }
  revalidatePath("/loonars-beauty");
  return actionSuccess();
}

export async function logContentMetricsAction(input: LogContentMetricsInput): Promise<ActionResult> {
  const session = await requirePermission("loonars_beauty.manage");
  const parsed = logContentMetricsSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await upsertContentMetric(supabase, {
      content_item_id: parsed.data.contentItemId,
      captured_at: parsed.data.capturedAt || new Date().toISOString().slice(0, 10),
      views: parsed.data.views,
      likes: parsed.data.likes,
      comments: parsed.data.comments,
      shares: parsed.data.shares,
      saves: parsed.data.saves,
      watch_through_50pct: parsed.data.watchThrough50Pct,
      link_clicks: parsed.data.linkClicks,
      boosted_spark_ads: parsed.data.boostedSparkAds,
      notes: parsed.data.notes || null,
      created_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mencatat performa konten");
  }
  revalidatePath("/loonars-beauty/performance");
  return actionSuccess();
}

export async function listContentMetricsAction(contentItemId: string) {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  return listContentMetrics(supabase, contentItemId);
}

/** Trailing-30-day actual mix vs the agreed 40/30/20/10 rotation -- computed here, not enforced by the DB, so the team can go deliberately off-ratio for a week without a constraint fighting them. */
export async function getContentRatioSummaryAction(days = 30) {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const items = await listContentItems(supabase, { status: "published" });
  const recentPublished = items.filter((item) => item.published_at && new Date(item.published_at) >= since);

  const counts: Record<string, number> = { problem_solution: 0, ugc: 0, edukasi: 0, promosi: 0 };
  for (const item of recentPublished) counts[item.category] = (counts[item.category] ?? 0) + 1;
  const total = recentPublished.length;

  return CATEGORY_KEYS.map((key) => ({
    category: key,
    target: RATIO_TARGET[key],
    actualCount: counts[key] ?? 0,
    actualPct: total > 0 ? Math.round(((counts[key] ?? 0) / total) * 100) : 0,
  }));
}

/** Retargeting signal from the strategy: watched past 50% but never clicked through to the store. */
export async function getRetargetingCandidatesAction(days = 14) {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await listRecentMetricsForPublishedContent(supabase, since.toISOString());

  return rows
    .map((row) => {
      const totalViews = row.metrics.reduce((sum, metric) => sum + (metric.views ?? 0), 0);
      const totalClicks = row.metrics.reduce((sum, metric) => sum + (metric.link_clicks ?? 0), 0);
      const hasHighRetention = row.metrics.some((metric) => metric.watch_through_50pct);
      return { id: row.id, title: row.title, category: row.category, platform: row.platform, totalViews, totalClicks, hasHighRetention };
    })
    .filter((row) => row.hasHighRetention && row.totalClicks === 0 && row.totalViews > 0);
}

export async function getLatestWeeklyEvaluationAction() {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  return getLatestWeeklyEvaluation(supabase);
}

/** Enqueues an on-demand weekly evaluation (ai_job_queue) via the SECURITY DEFINER RPC -- same manual-trigger pattern as markom_request_ads_research. The automatic Monday run still happens regardless. */
export async function triggerWeeklyEvaluationAction(): Promise<ActionResult> {
  await requirePermission("loonars_beauty.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_beauty_request_weekly_evaluation");
  if (error) return actionError(error.message);
  return actionSuccess();
}

/** Beauty's own account performance (Zernio, product='beauty', 0126) + latest weekly evaluation -- same shape as markom's getContentPlannerOverviewAction so ContentPlannerOverview can render either. */
export async function getBeautyContentOverviewAction() {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  const [instagramSnapshots, tiktokSnapshots, weeklyEvaluation] = await Promise.all([
    listRecentAccountSnapshots(supabase, "instagram", 1, "beauty"),
    listRecentAccountSnapshots(supabase, "tiktok", 1, "beauty"),
    getLatestWeeklyEvaluation(supabase),
  ]);
  return {
    instagram: instagramSnapshots[0] ?? null,
    tiktok: tiktokSnapshots[0] ?? null,
    weeklyEvaluation,
  };
}

/** Our content vs registered beauty competitors (0126) -- same pattern as markom's leasehold comparison, own Zernio account. */
export async function getLatestCompetitorComparisonAction() {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  return getLatestCompetitorComparison(supabase);
}

/** Enqueues an on-demand comparison run -- the automatic Monday run still happens regardless. */
export async function triggerCompetitorComparisonAction(): Promise<ActionResult> {
  await requirePermission("loonars_beauty.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_beauty_request_competitor_comparison");
  if (error) return actionError(error.message);
  return actionSuccess();
}

/** Enqueues an on-demand content-idea generation run (real Zernio performance + latest competitor comparison -> 3 ideas inserted into loonars_content_items) -- the automatic Monday run still happens regardless. */
export async function triggerContentIdeasAction(): Promise<ActionResult> {
  await requirePermission("loonars_beauty.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_beauty_request_content_ideas");
  if (error) return actionError(error.message);
  return actionSuccess();
}

export async function generateContentIdeasAction(input: GenerateContentIdeasInput): Promise<ActionResult<{ ideas: string }>> {
  await requirePermission("loonars_beauty.manage");
  const parsed = generateContentIdeasSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  try {
    const ideas = await generateLoonarsContentIdeas(parsed.data.category, parsed.data.count, parsed.data.context);
    return actionSuccess({ ideas });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal membuat ide konten dari AI");
  }
}

export async function draftFaqReplyAction(input: DraftFaqReplyInput): Promise<ActionResult<{ reply: string }>> {
  await requirePermission("loonars_beauty.manage");
  const parsed = draftFaqReplySchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  try {
    const reply = await draftLoonarsFaqReply(parsed.data.question);
    return actionSuccess({ reply });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal membuat draf balasan AI");
  }
}

/** Standalone order log, native to MK Connect's own database -- see migration 0107's header note for why this isn't synced with the separate Loonars Dashboard project. */
export async function createOrderAction(input: CreateOrderInput): Promise<ActionResult<{ id: string; orderNumber: string }>> {
  const session = await requirePermission("loonars_beauty.manage");
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const totalAmount = parsed.data.quantity * parsed.data.unitPrice;

  const supabase = await createClient();
  try {
    const created = await createOrder(supabase, {
      customer_name: parsed.data.customerName,
      customer_phone: parsed.data.customerPhone || null,
      customer_address: parsed.data.customerAddress || null,
      channel: parsed.data.channel,
      product_name: parsed.data.productName || undefined,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unitPrice,
      total_amount: totalAmount,
      courier: parsed.data.courier || null,
      tracking_number: parsed.data.trackingNumber || null,
      notes: parsed.data.notes || null,
      created_by: session.userId,
      updated_by: session.userId,
    });
    revalidatePath("/loonars-beauty/orders");
    return actionSuccess({ id: created.id, orderNumber: created.order_number });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan order");
  }
}

export async function listOrdersAction(filters?: { status?: LoonarsOrderStatus; channel?: LoonarsOrderChannel; search?: string }) {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  return listOrders(supabase, filters);
}

export async function updateOrderStatusAction(input: UpdateOrderStatusInput): Promise<ActionResult> {
  const session = await requirePermission("loonars_beauty.manage");
  const parsed = updateOrderStatusSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await updateOrderStatus(supabase, parsed.data.id, {
      status: parsed.data.status,
      tracking_number: parsed.data.trackingNumber || undefined,
      updated_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah status order");
  }
  revalidatePath("/loonars-beauty/orders");
  return actionSuccess();
}

export async function getOrderStatsAction(days = 30) {
  await requirePermission("loonars_beauty.view");
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  return getOrderStats(supabase, since.toISOString());
}
