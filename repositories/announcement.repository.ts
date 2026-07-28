import type { TypedSupabaseClient } from "@/lib/supabase/types";

export async function listAnnouncements(supabase: TypedSupabaseClient, page = 1, pageSize = 10, categoryId?: string) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("announcements")
    .select("*, announcement_categories(name, color), created_by_employee:employees!created_by(full_name, avatar_url)", {
      count: "exact",
    })
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .range(from, to);

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function listRecentAnnouncements(supabase: TypedSupabaseClient, limit = 5) {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, is_pinned, published_at, expires_at, announcement_categories(name, color)")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getAnnouncementById(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("announcements")
    .select(
      "*, announcement_categories(name, color), created_by_employee:employees!created_by(full_name, avatar_url), announcement_attachments(*), announcement_targets(*)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}

export async function listAnnouncementCategories(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase.from("announcement_categories").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function deleteAnnouncement(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("announcements").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
