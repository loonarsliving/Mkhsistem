"use client";

import * as React from "react";
import { Network } from "@capacitor/network";

import { isNativePlatform } from "./platform";

/** Offline detection: native connectivity API in the app, navigator.onLine in the browser. */
export function useNetworkStatus() {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    if (isNativePlatform()) {
      let listenerHandle: { remove: () => void } | undefined;
      Network.getStatus().then((status) => setOnline(status.connected));
      Network.addListener("networkStatusChange", (status) => setOnline(status.connected)).then((handle) => {
        listenerHandle = handle;
      });
      return () => listenerHandle?.remove();
    }

    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
