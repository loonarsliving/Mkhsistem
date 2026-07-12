"use client";

import * as React from "react";

import { isNativePlatform } from "@/lib/native/platform";
import { subscribeToWebPush } from "@/lib/push/web-push";

/** Rendered only inside the authenticated app shell, browser/PWA only -- the Capacitor native shell has its own FCM-based push path (lib/native/push.ts) and must not also register a Web Push subscription. */
export function WebPushRegistration() {
  React.useEffect(() => {
    if (isNativePlatform()) return;
    subscribeToWebPush().catch(() => {
      // Permission denial or an unsupported browser shouldn't break the rest of the app.
    });
  }, []);

  return null;
}
