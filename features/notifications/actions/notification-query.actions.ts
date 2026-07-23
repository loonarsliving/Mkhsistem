"use server";

import type { NotificationStatus } from "@/constants/app";
import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listNotifications } from "@/repositories/notification.repository";

export async function listNotificationsAction(page: number, status?: NotificationStatus) {
  const session = await requireSession();
  const supabase = await createClient();
  return listNotifications(supabase, session.userId, page, status);
}
