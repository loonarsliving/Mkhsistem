"use client";

import * as React from "react";

import { initPushNotifications } from "@/lib/native/push";

/** Rendered only inside the authenticated app shell — push tokens are only meaningful once we know who the device belongs to. */
export function PushRegistration() {
  React.useEffect(() => {
    initPushNotifications().catch(() => {
      // Permission denial or an unreachable FCM backend shouldn't break the rest of the app.
    });
  }, []);

  return null;
}
