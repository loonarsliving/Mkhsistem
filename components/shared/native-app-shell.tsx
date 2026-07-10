"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";

import { configureStatusBar, hideSplashScreen, onAppResume } from "@/lib/native/lifecycle";
import { useNetworkStatus } from "@/lib/native/network";
import { isNativePlatform } from "@/lib/native/platform";

import { PullToRefresh } from "./pull-to-refresh";

/**
 * Only active inside the Android shell (isNativePlatform() short-circuits
 * everything to a no-op render on the production website). Handles the
 * native chrome that has no web equivalent: hiding the splash screen once
 * the first paint completes, keeping the session fresh on foreground
 * resume, and surfacing an offline banner.
 */
export function NativeAppShell({ children }: { children: React.ReactNode }) {
  const online = useNetworkStatus();

  React.useEffect(() => {
    if (!isNativePlatform()) return;
    void configureStatusBar();
    const timer = setTimeout(() => void hideSplashScreen(), 300);
    const removeResumeListener = onAppResume(() => window.location.reload());
    return () => {
      clearTimeout(timer);
      removeResumeListener();
    };
  }, []);

  if (!isNativePlatform()) return <>{children}</>;

  return (
    <PullToRefresh>
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
          <WifiOff className="h-4 w-4" /> Tidak ada koneksi internet
        </div>
      )}
      {children}
    </PullToRefresh>
  );
}
