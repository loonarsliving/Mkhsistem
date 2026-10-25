"use client";

import * as React from "react";
import { Reply } from "lucide-react";

import { cn } from "@/lib/utils";

/** How far the bubble must travel to count as "reply" (px), and its max travel. */
const TRIGGER_PX = 56;
const MAX_PX = 80;

/**
 * Swipe a message to the right to reply (0301), like WhatsApp. Touch only:
 * a mostly-horizontal drag moves the bubble, past TRIGGER_PX it buzzes once
 * and replies on release; vertical drags are left to the list's scrolling.
 * Mouse users get the hover reply button next to the bubble (ReplyButton).
 */
export function SwipeToReply({ onReply, children }: { onReply: () => void; children: React.ReactNode }) {
  const [dx, setDx] = React.useState(0);
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const axis = React.useRef<"x" | "y" | null>(null);
  const armed = React.useRef(false);

  function reset() {
    start.current = null;
    axis.current = null;
    armed.current = false;
    setDx(0);
  }

  return (
    <div
      className="group relative touch-pan-y"
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        axis.current = null;
        armed.current = false;
      }}
      onTouchMove={(e) => {
        if (!start.current) return;
        const t = e.touches[0];
        const mx = t.clientX - start.current.x;
        const my = t.clientY - start.current.y;
        if (!axis.current && Math.abs(mx) + Math.abs(my) > 8) axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
        if (axis.current !== "x") return;
        const next = Math.max(0, Math.min(MAX_PX, mx * 0.6));
        setDx(next);
        if (next >= TRIGGER_PX && !armed.current) {
          armed.current = true;
          navigator.vibrate?.(15);
        } else if (next < TRIGGER_PX) {
          armed.current = false;
        }
      }}
      onTouchEnd={() => {
        if (armed.current) onReply();
        reset();
      }}
      onTouchCancel={reset}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#54656f] shadow-sm dark:bg-[#202c33] dark:text-[#8696a0]"
        style={{ opacity: Math.min(1, dx / TRIGGER_PX), transform: `translateY(-50%) scale(${0.6 + 0.4 * Math.min(1, dx / TRIGGER_PX)})` }}
      >
        <Reply className="h-4 w-4" />
      </div>
      <div
        className={cn("relative", dx === 0 && "transition-transform duration-200")}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

/** Hover reply button for mouse / trackpad users, shown beside the bubble. */
export function ReplyButton({ onReply }: { onReply: () => void }) {
  return (
    <button
      type="button"
      onClick={onReply}
      aria-label="Balas pesan"
      title="Balas"
      className="hidden h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-white/90 text-[#54656f] opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100 dark:bg-[#202c33] dark:text-[#8696a0] [@media(pointer:fine)]:flex"
    >
      <Reply className="h-4 w-4" />
    </button>
  );
}
