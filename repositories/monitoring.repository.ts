import type { TypedSupabaseClient } from "@/lib/supabase/types";

const PAGE_SIZE = 25;

export async function listErrorLogs(supabase: TypedSupabaseClient, page = 1, resolvedFilter?: boolean) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from("mkc_error_logs").select("*", { count: "exact" }).order("occurred_at", { ascending: false });

  if (resolvedFilter !== undefined) {
    query = query.eq("resolved", resolvedFilter);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function countUnresolvedErrors(supabase: TypedSupabaseClient) {
  const { count, error } = await supabase
    .from("mkc_error_logs")
    .select("*", { count: "exact", head: true })
    .eq("resolved", false);
  if (error) throw error;
  return count ?? 0;
}

export async function resolveErrorLog(supabase: TypedSupabaseClient, id: string, resolvedBy: string) {
  const { error } = await supabase
    .from("mkc_error_logs")
    .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
    .eq("id", id);
  if (error) throw error;
}

export async function getPerformanceSummary(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase.from("v_performance_summary").select("*");
  if (error) throw error;
  return data ?? [];
}
