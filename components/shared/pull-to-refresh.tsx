"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { isNativePlatform } from "@/lib/native/platform";

const TRIGGER_DISTANCE = 70;

/**
 * A minimal touch-driven pull-to-refresh, active only inside the Android
 * app (the production website already has browser/OS-level pull-to-refresh
 * where relevant, and this gesture would just conflict with page scrolling
 * there). Reloads the current route on release past the trigger distance.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef<number | null>(null);

  if (!isNativePlatform()) return <>{children}</>;

  function handleTouchStart(e: React.TouchEvent) {
    if (window.scrollY === 0) startY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPullDistance(Math.min(delta, TRIGGER_DISTANCE * 1.5));
  }

  function handleTouchEnd() {
    if (pullDistance >= TRIGGER_DISTANCE && !refreshing) {
      setRefreshing(true);
      window.location.reload();
    } else {
      setPullDistance(0);
    }
    startY.current = null;
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div
        className="flex items-center justify-center overflow-hidden text-muted-foreground transition-[height]"
        style={{ height: pullDistance }}
      >
        <RefreshCw className={`h-5 w-5 ${refreshing || pullDistance >= TRIGGER_DISTANCE ? "animate-spin" : ""}`} />
      </div>
      {children}
    </div>
  );
}
