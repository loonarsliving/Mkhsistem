"use client";

import * as React from "react";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";

import { isNativePlatform } from "@/lib/native/platform";
import { subscribeToWebPush } from "@/lib/push/web-push";

type PromptState = "hidden" | "ask" | "denied" | "ios_install";

const DISMISS_KEY = "loonars-connect:notif-prompt-dismissed";

function detect(): PromptState {
  if (isNativePlatform()) return "hidden";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    // iPhone only allows web push for a home-screen app.
    return ios && !standalone ? "ios_install" : "hidden";
  }
  if (Notification.permission === "granted") return "hidden";
  if (Notification.permission === "denied") return "denied";
  return "ask";
}

/**
 * Chat push (0297) only reaches phones that allowed notifications. The app
 * shell asks on page load, which iPhone ignores unless it comes from a tap,
 * so the chat list offers the tap -- plus the "Add to Home Screen" hint that
 * iPhone needs first.
 */
export function ChatNotificationPrompt() {
  const [state, setState] = React.useState<PromptState>("hidden");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // storage blocked: just show the prompt
    }
    const s = detect();
    setState(dismissed && s !== "ask" ? "hidden" : s);
  }, []);

  if (state === "hidden") return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setState("hidden");
  };

  async function enable() {
    setBusy(true);
    try {
      // Ask inside the tap itself (iPhone rejects a prompt after an await).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ask");
        return;
      }
      await subscribeToWebPush();
      toast.success("Notifikasi chat aktif");
      setState("hidden");
    } catch {
      toast.error("Notifikasi belum bisa diaktifkan di perangkat ini");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-2 border-b bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
      <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {state === "ask" && (
          <>
            <p>Aktifkan notifikasi agar pesan grup masuk ke HP seperti WhatsApp.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void enable()}
              className="rounded-full bg-emerald-600 px-3 py-1 font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Mengaktifkan…" : "Aktifkan notifikasi"}
            </button>
          </>
        )}
        {state === "ios_install" && (
          <p>
            Di iPhone, notifikasi hanya bisa untuk aplikasi di Layar Utama: buka halaman ini di Safari → tombol Bagikan → <b>Tambahkan ke Layar Utama</b>,
            lalu buka dari ikon itu dan aktifkan notifikasi.
          </p>
        )}
        {state === "denied" && <p>Notifikasi diblokir. Izinkan notifikasi untuk situs ini di pengaturan browser/HP agar pesan grup masuk.</p>}
      </div>
      {state !== "ask" && (
        <button type="button" onClick={dismiss} className="rounded-full p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900" aria-label="Tutup">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
