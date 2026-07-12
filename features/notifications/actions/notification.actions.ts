"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { archiveNotification, markAllNotificationsRead, markNotificationRead } from "@/repositories/notification.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  try {
    await markNotificationRead(supabase, notificationId);
    revalidatePath("/notifications");
    return actionSuccess();
  } catch {
    return actionError("Gagal menandai notifikasi");
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  try {
    await markAllNotificationsRead(supabase);
    revalidatePath("/notifications");
    return actionSuccess();
  } catch {
    return actionError("Gagal menandai semua notifikasi");
  }
}

export async function archiveNotificationAction(notificationId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  try {
    await archiveNotification(supabase, notificationId);
    revalidatePath("/notifications");
    return actionSuccess();
  } catch {
    return actionError("Gagal mengarsipkan notifikasi");
  }
}
