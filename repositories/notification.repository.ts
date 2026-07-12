import type { NotificationStatus } from "@/constants/app";
import type { TypedSupabaseClient } from "@/lib/supabase/types";

const PAGE_SIZE = 20;

/** status omitted = everything except archived (the default "inbox" view); pass a specific status to filter to exactly that tab. */
export async function listNotifications(
  supabase: TypedSupabaseClient,
  userId: string,
  page = 1,
  status?: NotificationStatus,
) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from("mkc_notifications").select("*", { count: "exact" }).eq("user_id", userId);
  query = status ? query.eq("status", status) : query.neq("status", "archived");

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);

  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function countUnreadNotifications(supabase: TypedSupabaseClient, userId: string) {
  const { count, error } = await supabase
    .from("mkc_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "unread");

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

export async function archiveNotification(supabase: TypedSupabaseClient, notificationId: string) {
  const { error } = await supabase.rpc("archive_notification", { p_notification_id: notificationId });
  if (error) throw error;
}
