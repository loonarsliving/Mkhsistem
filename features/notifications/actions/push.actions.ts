"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

/** Called by the Android app on launch (and on FCM token refresh) to register this device for push delivery. */
export async function registerPushTokenAction(token: string, platform: "android" | "ios"): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("mkc_device_push_tokens")
    .upsert({ user_id: session.userId, token, platform }, { onConflict: "token" });
  if (error) return actionError("Gagal mendaftarkan perangkat untuk notifikasi");
  return actionSuccess();
}

/** Called on logout so a shared/lost device stops receiving this user's pushes. */
export async function unregisterPushTokenAction(token: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("mkc_device_push_tokens").delete().eq("token", token);
  if (error) return actionError("Gagal menghapus pendaftaran perangkat");
  return actionSuccess();
}
