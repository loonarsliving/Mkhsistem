import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { KontenAiAiReportRow } from "@/types/domain";

export interface CreateKontenAiAiReportInput {
  period: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  totalContent: number;
  publishedContent: number;
  totalViews: number;
  totalReach: number;
  engagementRate: number;
  avgCtr: number | null;
  totalLeads: number | null;
  conversionRate: number | null;
  summary: string;
  createdBy: string;
}

export async function createKontenAiAiReport(supabase: TypedSupabaseClient, input: CreateKontenAiAiReportInput): Promise<KontenAiAiReportRow> {
  const { data, error } = await supabase
    .from("kontenai_ai_reports")
    .insert({
      period: input.period,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      total_content: input.totalContent,
      published_content: input.publishedContent,
      total_views: input.totalViews,
      total_reach: input.totalReach,
      engagement_rate: input.engagementRate,
      avg_ctr: input.avgCtr,
      total_leads: input.totalLeads,
      conversion_rate: input.conversionRate,
      summary: input.summary,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiAiReportRow;
}

/** History of every generated AI Report, newest first. */
export async function listKontenAiAiReports(supabase: TypedSupabaseClient, limit = 50): Promise<KontenAiAiReportRow[]> {
  const { data, error } = await supabase.from("kontenai_ai_reports").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as KontenAiAiReportRow[];
}
