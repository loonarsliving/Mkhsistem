"use client";

import { usePathname } from "next/navigation";

/**
 * Subtle 150ms fade on route change (per UI Pro Max's "Subtle" page-transition
 * tier: 200-300ms, never blocking navigation) -- keying the wrapper on
 * pathname forces React to remount it per route, replaying the existing
 * animate-fade-in keyframe (tailwind.config.ts) instead of a hard cut.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in">
      {children}
    </div>
  );
}
