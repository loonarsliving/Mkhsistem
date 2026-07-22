import type { TypedSupabaseClient } from "@/lib/supabase/types";

export interface AnalyticsContentRow {
  id: string;
  createdAt: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  ctr: number | null;
  leads: number | null;
  aiInsight: string;
  platform: string;
  caption: string;
  scheduledAt: string | null;
  storyboardTitle: string;
}

const SELECT_COLUMNS =
  "id, created_at, views, reach, likes, comments, shares, saves, ctr, leads, ai_insight, publishSchedule:publish_schedule_id(platform, caption, scheduled_at, renderJob:render_job_id(storyboard:storyboard_id(title)))";

interface RawRow {
  id: string;
  created_at: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  ctr: number | null;
  leads: number | null;
  ai_insight: string;
  publishSchedule: {
    platform: string;
    caption: string;
    scheduled_at: string | null;
    renderJob: { storyboard: { title: string } | null } | null;
  } | null;
}

/** Every logged performance record with just enough joined context (platform, caption, storyboard title) for Analytics' KPIs, chart, and top/worst content -- the read-only data source behind the whole Analytics Dashboard (Sprint 9). */
export async function listAnalyticsContentRows(supabase: TypedSupabaseClient): Promise<AnalyticsContentRow[]> {
  const { data, error } = await supabase.from("kontenai_content_performance").select(SELECT_COLUMNS).order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as RawRow[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    views: row.views,
    reach: row.reach,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    ctr: row.ctr,
    leads: row.leads,
    aiInsight: row.ai_insight,
    platform: row.publishSchedule?.platform ?? "unknown",
    caption: row.publishSchedule?.caption ?? "",
    scheduledAt: row.publishSchedule?.scheduled_at ?? null,
    storyboardTitle: row.publishSchedule?.renderJob?.storyboard?.title ?? "Konten",
  }));
}

export interface PublishScheduleCounts {
  totalContent: number;
  publishedContent: number;
}

/** "Total Content" / "Published Content" KPIs -- counted from Publishing Engine's schedules (Sprint 7), every content instance that ever entered the publish pipeline. */
export async function countPublishSchedules(supabase: TypedSupabaseClient): Promise<PublishScheduleCounts> {
  const [{ count: totalContent }, { count: publishedContent }] = await Promise.all([
    supabase.from("kontenai_publish_schedules").select("id", { count: "exact", head: true }),
    supabase.from("kontenai_publish_schedules").select("id", { count: "exact", head: true }).eq("status", "published"),
  ]);
  return { totalContent: totalContent ?? 0, publishedContent: publishedContent ?? 0 };
}
