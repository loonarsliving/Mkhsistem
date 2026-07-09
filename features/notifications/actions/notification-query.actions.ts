"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listNotifications } from "@/repositories/notification.repository";

export async function listNotificationsAction(page: number) {
  const session = await requireSession();
  const supabase = await createClient();
  return listNotifications(supabase, session.userId, page);
}
