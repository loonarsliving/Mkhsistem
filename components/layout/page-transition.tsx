"use client";

import { usePathname } from "next/navigation";

/**
 * Fade + slight rise on route change (UI Pro Max "Subtle" page-transition
 * tier: 200-300ms, never blocking navigation) -- keying the wrapper on
 * pathname forces React to remount it per route, replaying the
 * stagger-fade-in keyframe (tailwind.config.ts) instead of a hard cut.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-stagger-fade-in">
      {children}
    </div>
  );
}
