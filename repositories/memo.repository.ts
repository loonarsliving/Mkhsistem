import type { TypedSupabaseClient } from "@/lib/supabase/types";

export async function listMemos(supabase: TypedSupabaseClient, page = 1, pageSize = 10) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("memos")
    .select("*, created_by_employee:created_by(full_name, avatar_url)", { count: "exact" })
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function listRecentMemos(supabase: TypedSupabaseClient, limit = 5) {
  const { data, error } = await supabase
    .from("memos")
    .select("id, title, priority, is_pinned, is_mandatory_read, published_at")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getMemoById(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("memos")
    .select(
      "*, created_by_employee:created_by(full_name, avatar_url), memo_attachments(*), memo_targets(*)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}

export async function getMemoReadReceipts(supabase: TypedSupabaseClient, memoId: string) {
  const [{ data: audience, error: audienceError }, { data: reads, error: readsError }] = await Promise.all([
    supabase.rpc("get_memo_audience", { p_memo_id: memoId }),
    supabase.from("memo_reads").select("user_id, read_at, employees:user_id(full_name, avatar_url, employee_code)").eq("memo_id", memoId),
  ]);
  if (audienceError) throw audienceError;
  if (readsError) throw readsError;
  return { audienceCount: audience?.length ?? 0, reads: reads ?? [] };
}

export async function hasUserReadMemo(supabase: TypedSupabaseClient, memoId: string, userId: string) {
  const { data, error } = await supabase
    .from("memo_reads")
    .select("memo_id")
    .eq("memo_id", memoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function deleteMemo(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("memos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
