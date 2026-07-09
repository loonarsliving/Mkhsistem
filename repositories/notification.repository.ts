import type { TypedSupabaseClient } from "@/lib/supabase/types";

const PAGE_SIZE = 20;

export async function listNotifications(supabase: TypedSupabaseClient, userId: string, page = 1) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from("mkc_notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function countUnreadNotifications(supabase: TypedSupabaseClient, userId: string) {
  const { count, error } = await supabase
    .from("mkc_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(supabase: TypedSupabaseClient, notificationId: string) {
  const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: notificationId });
  if (error) throw error;
}

export async function markAllNotificationsRead(supabase: TypedSupabaseClient) {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}
