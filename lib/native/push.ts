import { registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

import { registerPushTokenAction, unregisterPushTokenAction } from "@/features/notifications/actions/push.actions";

import { isNativePlatform } from "./platform";

interface FirebaseStatusPlugin {
  isConfigured(): Promise<{ configured: boolean }>;
}

/**
 * Backed by id.haluoleo.mkconnect.FirebaseStatusPlugin (android/app). Push
 * registration below crashes the whole app if called before a real
 * google-services.json has been provisioned (FirebaseMessaging.getInstance()
 * throws IllegalStateException with no default FirebaseApp) — this plugin
 * reports whether that's the case so registration can be skipped instead.
 */
const FirebaseStatus = registerPlugin<FirebaseStatusPlugin>("FirebaseStatus");

/**
 * Registers this device for Firebase Cloud Messaging push and wires the
 * token into mkc_device_push_tokens (see supabase/migrations/0021). This
 * only sets up the *receiving* side — actually sending a push (an edge
 * function or scheduled job calling the FCM HTTP v1 API when a memo/
 * announcement/registration notification is created) needs a real Firebase
 * project's service account credentials, which isn't something that can be
 * provisioned without the company creating that project — see
 * docs/android/BUILD.md for the exact activation steps.
 */
export async function initPushNotifications(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { configured } = await FirebaseStatus.isConfigured();
    if (!configured) return;
  } catch {
    // If we can't confirm Firebase is configured, don't risk calling
    // register() below — a skipped push registration is far better than
    // crashing the whole app on every launch.
    return;
  }

  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    const requested = await PushNotifications.requestPermissions();
    if (requested.receive !== "granted") return;
  }

  await PushNotifications.addListener("registration", (token) => {
    void registerPushTokenAction(token.value, "android");
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.error("Push registration failed", error);
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const link = (action.notification.data as { link?: string } | undefined)?.link;
    if (link) window.location.href = link;
  });

  await PushNotifications.register();
}

/** Clears the notification tray — called after the user views /notifications so stale pushes don't linger. */
export async function clearDeliveredPushNotifications(): Promise<void> {
  if (!isNativePlatform()) return;
  await PushNotifications.removeAllDeliveredNotifications();
}

/** Called from the logout action so a shared device stops receiving this user's notifications. */
export async function unregisterCurrentDeviceToken(token: string): Promise<void> {
  if (!isNativePlatform()) return;
  await unregisterPushTokenAction(token);
}
