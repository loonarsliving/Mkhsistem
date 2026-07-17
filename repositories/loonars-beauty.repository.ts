import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";

type LoonarsContentCategory = Tables<"loonars_content_items">["category"];
type LoonarsContentStatus = Tables<"loonars_content_items">["status"];

export async function listContentItems(
  supabase: TypedSupabaseClient,
  filters?: { category?: LoonarsContentCategory; status?: LoonarsContentStatus },
) {
  let query = supabase.from("loonars_content_items").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createContentItem(supabase: TypedSupabaseClient, input: TablesInsert<"loonars_content_items">) {
  const { data, error } = await supabase.from("loonars_content_items").insert(input).select("id").single();
  if (error) throw error;
  return data;
}

export async function updateContentItem(supabase: TypedSupabaseClient, id: string, patch: TablesUpdate<"loonars_content_items">) {
  const { error } = await supabase.from("loonars_content_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function softDeleteContentItem(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("loonars_content_items").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function upsertContentMetric(supabase: TypedSupabaseClient, input: TablesInsert<"loonars_content_metrics">) {
  const { error } = await supabase.from("loonars_content_metrics").upsert(input, { onConflict: "content_item_id,captured_at" });
  if (error) throw error;
}

export async function listContentMetrics(supabase: TypedSupabaseClient, contentItemId: string) {
  const { data, error } = await supabase
    .from("loonars_content_metrics")
    .select("*")
    .eq("content_item_id", contentItemId)
    .order("captured_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Published content since sinceISODate, each with its logged daily metrics attached -- the caller aggregates (ratio, retargeting, top performer), this is pure data access. */
export async function listRecentMetricsForPublishedContent(supabase: TypedSupabaseClient, sinceISODate: string) {
  const { data: items, error: itemsError } = await supabase
    .from("loonars_content_items")
    .select("id, title, category, platform, published_at")
    .eq("status", "published")
    .gte("published_at", sinceISODate)
    .is("deleted_at", null);
  if (itemsError) throw itemsError;
  if (!items || items.length === 0) return [];

  const ids = items.map((item) => item.id);
  const { data: metrics, error: metricsError } = await supabase
    .from("loonars_content_metrics")
    .select("content_item_id, views, link_clicks, watch_through_50pct, captured_at")
    .in("content_item_id", ids);
  if (metricsError) throw metricsError;

  return items.map((item) => ({
    ...item,
    metrics: (metrics ?? []).filter((metric) => metric.content_item_id === item.id),
  }));
}

export async function upsertOrderSnapshot(supabase: TypedSupabaseClient, input: TablesInsert<"loonars_order_snapshots">) {
  const { error } = await supabase.from("loonars_order_snapshots").upsert(input, { onConflict: "snapshot_date,channel" });
  if (error) throw error;
}

export async function listOrderSnapshots(supabase: TypedSupabaseClient, sinceISODate: string) {
  const { data, error } = await supabase
    .from("loonars_order_snapshots")
    .select("*")
    .gte("snapshot_date", sinceISODate)
    .order("snapshot_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLatestWeeklyEvaluation(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("loonars_weekly_evaluations")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
