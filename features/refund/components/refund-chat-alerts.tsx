"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

/** Fired on window when a refund customer message arrives, so an open chat reloads immediately instead of waiting for its poll. */
export const REFUND_CHAT_EVENT = "refund-chat:new";
export const REFUND_CHAT_SOUND_KEY = "refund-chat-sound";

export function isRefundChatSoundOn(): boolean {
  try {
    return window.localStorage.getItem(REFUND_CHAT_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Short two-tone "ding" via Web Audio -- no audio file to ship. Silently does nothing if the browser blocks audio before a user gesture. */
function playDing() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // audio not available -- the toast and push still notify
  }
}

interface NotificationRow {
  category: string | null;
  title: string;
  body: string | null;
  link: string | null;
  metadata: { refund_customer_id?: string } | null;
}

/**
 * Live alert for new refund customer chats (owner 2026-10-21), mounted in
 * the app layout for anyone with refund access. Listens to this user's own
 * mkc_notifications inserts (RLS-scoped realtime, same feed as the bell)
 * and, for category refund_customer_message: plays a ding, shows a toast
 * with "Balas", marks the browser tab title while the tab is in the
 * background, and nudges an open chat to reload. Phone/closed-tab alerts
 * stay with the existing web push (public/sw.js).
 */
export function RefundChatAlerts({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = React.useMemo(() => createClient(), []);
  const openChatRef = React.useRef<string | null>(null);
  const missedRef = React.useRef(0);
  const baseTitleRef = React.useRef<string | null>(null);

  // Which conversation is on screen right now (full-screen chat page only).
  React.useEffect(() => {
    openChatRef.current = pathname === "/refund/chat" ? searchParams.get("c") : null;
  }, [pathname, searchParams]);

  // Restore the tab title once the user comes back to the tab.
  React.useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && baseTitleRef.current !== null) {
        document.title = baseTitleRef.current;
        baseTitleRef.current = null;
        missedRef.current = 0;
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  React.useEffect(() => {
    const channel = supabase
      .channel(`refund-chat-alerts:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mkc_notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          if (row.category !== "refund_customer_message") return;

          const customerId = row.metadata?.refund_customer_id ?? null;
          window.dispatchEvent(new CustomEvent(REFUND_CHAT_EVENT, { detail: { customerId } }));
          if (isRefundChatSoundOn()) playDing();

          if (document.visibilityState !== "visible") {
            if (baseTitleRef.current === null) baseTitleRef.current = document.title;
            missedRef.current += 1;
            document.title = `(${missedRef.current}) 💬 ${row.title}`;
          }

          // Already looking at this exact conversation -- the message just appears there.
          if (customerId && openChatRef.current === customerId && document.visibilityState === "visible") return;

          toast(row.title, {
            description: row.body ? (row.body.length > 140 ? `${row.body.slice(0, 137)}...` : row.body) : undefined,
            duration: 10_000,
            action: row.link ? { label: "Balas", onClick: () => router.push(row.link as string) } : undefined,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, router]);

  return null;
}
