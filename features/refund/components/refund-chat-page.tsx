"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff } from "lucide-react";

import type { RefundCustomer } from "@/repositories/refund.repository";

import { REFUND_CHAT_SOUND_KEY, isRefundChatSoundOn } from "./refund-chat-alerts";
import { RefundChatInbox } from "./refund-chat-inbox";

/** Client shell for /refund/chat: keeps the open conversation in the URL (?c=) so it survives refresh and can be shared/linked. */
export function RefundChatPage({
  customers,
  canManage,
  initialCustomerId,
}: {
  customers: RefundCustomer[];
  canManage: boolean;
  initialCustomerId: string | null;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(initialCustomerId);
  const totalUnread = customers.reduce((s, c) => s + c.unreadMessages, 0);
  const [soundOn, setSoundOn] = React.useState(true);
  React.useEffect(() => setSoundOn(isRefundChatSoundOn()), []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(REFUND_CHAT_SOUND_KEY, next ? "on" : "off");
    } catch {
      // storage unavailable -- toggle still applies to this page view
    }
  }

  function select(id: string | null) {
    setSelectedId(id);
    // replaceState, not router.push: switching chats shouldn't re-render the server page or pile up history.
    const url = id ? `/refund/chat?c=${id}` : "/refund/chat";
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/refund" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Kembali ke Refund">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">Chat Refund</h1>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">
              {totalUnread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block">Dikirim dari nomor WhatsApp perusahaan · hanya ke customer refund</p>
          <button
            type="button"
            onClick={toggleSound}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Bunyi notifikasi chat baru"
          >
            {soundOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />} Suara {soundOn ? "aktif" : "mati"}
          </button>
        </div>
      </div>
      <RefundChatInbox
        customers={customers}
        canManage={canManage}
        selectedId={selectedId}
        onSelect={select}
        className="h-[calc(100dvh-9.5rem)]"
      />
    </div>
  );
}
