"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import {
  computeBestPostingHour,
  computeKpis,
  computePerformanceOverTime,
  rankContent,
  type AnalyticsKpis,
  type ContentPerformanceRanking,
  type PerformancePeriodPoint,
} from "@/features/kontenai/analytics/lib/aggregate";
import { generateOptimizationRecommendation, generatePeriodSummary } from "@/lib/ai/domains/kontenai-analytics";
import { createClient } from "@/lib/supabase/server";
import { countPublishSchedules, listAnalyticsContentRows, type AnalyticsContentRow } from "@/repositories/kontenai-analytics.repository";
import { createKontenAiAiReport, listKontenAiAiReports } from "@/repositories/kontenai-ai-reports.repository";
import {
  createKontenAiOptimizationRecommendation,
  listKontenAiOptimizationRecommendations,
} from "@/repositories/kontenai-optimization.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiAiReportRow, type KontenAiOptimizationRecommendationRow } from "@/types/domain";

const AI_REPORT_PATH = "/kontenai/ai-report";
const AI_OPTIMIZATION_PATH = "/kontenai/ai-optimization";

export interface AnalyticsDashboardData {
  kpis: AnalyticsKpis;
  performanceOverTime: PerformancePeriodPoint[];
  topContent: ContentPerformanceRanking[];
  worstContent: ContentPerformanceRanking[];
}

/** Spec items 1-5: the whole Analytics Dashboard's data, computed live over Sprint 7/8's already-Supabase-backed tables. */
export async function getAnalyticsDashboardDataAction(): Promise<AnalyticsDashboardData> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  const [rows, counts] = await Promise.all([listAnalyticsContentRows(supabase), countPublishSchedules(supabase)]);
  const { top, worst } = rankContent(rows);

  return {
    kpis: computeKpis(rows, counts),
    performanceOverTime: computePerformanceOverTime(rows),
    topContent: top,
    worstContent: worst,
  };
}

function describeContent(row: AnalyticsContentRow & { engagementRate: number }): string {
  return `"${row.storyboardTitle}" (${row.platform}): engagement rate ${row.engagementRate}%, ${row.views} views, ${row.reach} reach`;
}

const MIN_RECORDS_FOR_RECOMMENDATION = 1;

/** Spec items 6-7: "AI Recommendation berdasarkan Learning Engine" -- Hook/Caption/CTA/Duration/Visual Style/Posting Time, reasoning over real top/worst content and Learning Engine's AI Insights. */
export async function generateOptimizationRecommendationAction(): Promise<ActionResult<KontenAiOptimizationRecommendationRow>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const rows = await listAnalyticsContentRows(supabase);
    if (rows.length < MIN_RECORDS_FOR_RECOMMENDATION) {
      return actionError("Belum ada data performa konten dari Learning Engine untuk dianalisis");
    }

    const { top, worst } = rankContent(rows, 3);
    const bestPostingHour = computeBestPostingHour(rows);
    const insightSamples = rows
      .slice(-5)
      .map((row) => row.aiInsight)
      .filter(Boolean);

    const result = await generateOptimizationRecommendation({
      recordCount: rows.length,
      topSummaries: top.map(describeContent),
      worstSummaries: worst.map(describeContent),
      insightSamples,
      bestPostingTime: bestPostingHour ? `${bestPostingHour.bestHourLabel} (engagement rate rata-rata ${bestPostingHour.avgEngagementRate}%)` : null,
    });

    const record = await createKontenAiOptimizationRecommendation(supabase, {
      recommendedHook: result.hook,
      recommendedCaption: result.caption,
      recommendedCta: result.cta,
      recommendedDurationSeconds: result.durationSeconds,
      recommendedVisualStyle: result.visualStyle,
      recommendedPostingTime: result.postingTime,
      rationale: result.rationale,
      basedOnRecordCount: rows.length,
      createdBy: session.userId,
    });

    revalidatePath(AI_OPTIMIZATION_PATH);
    return actionSuccess(record);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menghasilkan AI Recommendation");
  }
}

export async function listOptimizationRecommendationsAction(): Promise<KontenAiOptimizationRecommendationRow[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiOptimizationRecommendations(supabase);
}

function periodBounds(period: "weekly" | "monthly"): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (period === "weekly" ? 7 : 30));
  return { start, end };
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Spec item 8: "AI Report" weekly/monthly summary -- filters logged performance to the period, then asks Gemini to narrate it grounded in the period's real KPIs and top/worst content. */
export async function generateAiReportAction(period: "weekly" | "monthly"): Promise<ActionResult<KontenAiAiReportRow>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const { start, end } = periodBounds(period);
    const allRows = await listAnalyticsContentRows(supabase);
    const rows = allRows.filter((row) => {
      const createdAt = new Date(row.createdAt);
      return createdAt >= start && createdAt <= end;
    });

    if (rows.length === 0) {
      return actionError(`Tidak ada data performa konten pada periode ${period === "weekly" ? "mingguan" : "bulanan"} ini`);
    }

    const counts = await countPublishSchedules(supabase);
    const kpis = computeKpis(rows, counts);
    const { top, worst } = rankContent(rows, 3);

    const summary = await generatePeriodSummary({
      period,
      periodLabel: `${toDateOnly(start)} - ${toDateOnly(end)}`,
      totalContent: kpis.totalContent,
      publishedContent: kpis.publishedContent,
      totalViews: kpis.totalViews,
      totalReach: kpis.totalReach,
      engagementRate: kpis.engagementRate,
      avgCtr: kpis.avgCtr,
      totalLeads: kpis.totalLeads,
      conversionRate: kpis.conversionRate,
      topContentTitles: top.map((row) => row.storyboardTitle),
      worstContentTitles: worst.map((row) => row.storyboardTitle),
    });

    const report = await createKontenAiAiReport(supabase, {
      period,
      periodStart: toDateOnly(start),
      periodEnd: toDateOnly(end),
      totalContent: kpis.totalContent,
      publishedContent: kpis.publishedContent,
      totalViews: kpis.totalViews,
      totalReach: kpis.totalReach,
      engagementRate: kpis.engagementRate,
      avgCtr: kpis.avgCtr,
      totalLeads: kpis.totalLeads,
      conversionRate: kpis.conversionRate,
      summary,
      createdBy: session.userId,
    });

    revalidatePath(AI_REPORT_PATH);
    return actionSuccess(report);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menghasilkan AI Report");
  }
}

export async function listAiReportsAction(): Promise<KontenAiAiReportRow[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiAiReports(supabase);
}
