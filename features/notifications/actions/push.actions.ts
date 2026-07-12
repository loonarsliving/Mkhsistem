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

interface WebPushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  authKey: string;
  userAgent?: string;
}

/** Called by the browser (web/PWA, never inside the Capacitor shell) after the user grants Notification permission and PushManager.subscribe() succeeds. */
export async function registerWebPushSubscriptionAction(input: WebPushSubscriptionInput): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("mkc_push_subscriptions").upsert(
    {
      user_id: session.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth_key: input.authKey,
      user_agent: input.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return actionError("Gagal mendaftarkan notifikasi push");
  return actionSuccess();
}

/** Called on logout, or when the browser reports the subscription as no longer valid. */
export async function unregisterWebPushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("mkc_push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return actionError("Gagal menghapus pendaftaran notifikasi push");
  return actionSuccess();
}
