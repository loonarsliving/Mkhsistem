import type { AnalyticsContentRow, PublishScheduleCounts } from "@/repositories/kontenai-analytics.repository";

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface AnalyticsKpis {
  totalContent: number;
  publishedContent: number;
  totalViews: number;
  totalReach: number;
  engagementRate: number;
  avgCtr: number | null;
  totalLeads: number | null;
  conversionRate: number | null;
}

/** Spec item 2 -- the 8 headline KPIs shown at the top of the Analytics Dashboard. */
export function computeKpis(rows: AnalyticsContentRow[], counts: PublishScheduleCounts): AnalyticsKpis {
  const totalViews = sum(rows.map((r) => r.views));
  const totalReach = sum(rows.map((r) => r.reach));
  const totalEngagement = sum(rows.map((r) => r.likes + r.comments + r.shares + r.saves));
  const engagementRate = totalReach > 0 ? round2((totalEngagement / totalReach) * 100) : 0;

  const ctrRows = rows.filter((r): r is AnalyticsContentRow & { ctr: number } => r.ctr !== null);
  const avgCtr = ctrRows.length > 0 ? round2(sum(ctrRows.map((r) => r.ctr)) / ctrRows.length) : null;

  const leadsRows = rows.filter((r): r is AnalyticsContentRow & { leads: number } => r.leads !== null);
  const totalLeads = leadsRows.length > 0 ? sum(leadsRows.map((r) => r.leads)) : null;
  const conversionRate = totalLeads !== null && totalViews > 0 ? round2((totalLeads / totalViews) * 100) : null;

  return {
    totalContent: counts.totalContent,
    publishedContent: counts.publishedContent,
    totalViews,
    totalReach,
    engagementRate,
    avgCtr,
    totalLeads,
    conversionRate,
  };
}

export interface PerformancePeriodPoint {
  label: string;
  views: number;
  reach: number;
  engagement: number;
}

/** ISO-week label ("2026-W12") for a date -- coarse enough to still read as a trend once a handful of content pieces are logged. */
function isoWeekLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Spec item 3 -- performance-over-time chart, bucketed by ISO week. */
export function computePerformanceOverTime(rows: AnalyticsContentRow[]): PerformancePeriodPoint[] {
  const buckets = new Map<string, PerformancePeriodPoint>();

  for (const row of rows) {
    const label = isoWeekLabel(row.createdAt);
    const bucket = buckets.get(label) ?? { label, views: 0, reach: 0, engagement: 0 };
    bucket.views += row.views;
    bucket.reach += row.reach;
    bucket.engagement += row.likes + row.comments + row.shares + row.saves;
    buckets.set(label, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export interface ContentPerformanceRanking extends AnalyticsContentRow {
  engagementRate: number;
}

function withEngagementRate(row: AnalyticsContentRow): ContentPerformanceRanking {
  const engagement = row.likes + row.comments + row.shares + row.saves;
  const engagementRate = row.reach > 0 ? round2((engagement / row.reach) * 100) : 0;
  return { ...row, engagementRate };
}

/** Spec items 4-5 -- Top and Worst Performing Content, ranked by per-content engagement rate. */
export function rankContent(rows: AnalyticsContentRow[], limit = 5): { top: ContentPerformanceRanking[]; worst: ContentPerformanceRanking[] } {
  const ranked = rows.map(withEngagementRate).sort((a, b) => b.engagementRate - a.engagementRate || b.views - a.views);
  return {
    top: ranked.slice(0, limit),
    worst: ranked.slice(-limit).reverse(),
  };
}

export interface PostingTimeInsight {
  bestHourLabel: string;
  avgEngagementRate: number;
}

/** Feeds the "Posting Time" recommendation (spec item 7) -- which hour-of-day (by scheduled_at) has the best average per-content engagement rate. Null if no schedule has a publish time logged yet. */
export function computeBestPostingHour(rows: AnalyticsContentRow[]): PostingTimeInsight | null {
  const withTime = rows.filter((row): row is AnalyticsContentRow & { scheduledAt: string } => Boolean(row.scheduledAt));
  if (withTime.length === 0) return null;

  const byHour = new Map<number, { total: number; count: number }>();
  for (const row of withTime) {
    const hour = new Date(row.scheduledAt).getHours();
    const engagement = row.likes + row.comments + row.shares + row.saves;
    const rate = row.reach > 0 ? (engagement / row.reach) * 100 : 0;
    const bucket = byHour.get(hour) ?? { total: 0, count: 0 };
    bucket.total += rate;
    bucket.count += 1;
    byHour.set(hour, bucket);
  }

  const best = [...byHour.entries()].map(([hour, { total, count }]) => ({ hour, avg: total / count })).sort((a, b) => b.avg - a.avg)[0];
  if (!best) return null;
  return { bestHourLabel: `${String(best.hour).padStart(2, "0")}:00`, avgEngagementRate: round2(best.avg) };
}
