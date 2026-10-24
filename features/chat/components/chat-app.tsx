"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ChatConversation, ChatPerson, ChatUnit } from "@/repositories/chat.repository";

import { listConversationsAction } from "../actions/chat.actions";
import { ChatContextProvider } from "./chat-context";
import { ChatNotificationPrompt } from "./chat-notification-prompt";
import { ChatRoom, ConversationAvatar } from "./chat-room";
import { formatListStamp } from "./chat-utils";

/** Conversation list refresh while open (unread badges), on top of realtime. */
const LIST_REFRESH_MS = 30_000;

/**
 * Visible height while the on-screen keyboard is open. iOS Safari does not
 * shrink 100dvh for the keyboard, so the composer would sit under it; the
 * visual viewport does shrink. Only tracked below lg (phones / tablets) and
 * only while it differs from the layout height; null = use 100dvh.
 */
function useKeyboardAwareHeight(): number | null {
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      const keyboardOpen = mq.matches && window.innerHeight - vv.height > 80;
      setHeight(keyboardOpen ? Math.round(vv.height) : null);
      // iOS scrolls the page up to reveal the focused field; the chat already fits.
      if (keyboardOpen && window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return height;
}

export function ChatApp({
  userId,
  isOwner,
  initialConversations,
  initialConversationId,
  peopleByDepartment,
  unitsByDepartment,
}: {
  userId: string;
  isOwner: boolean;
  initialConversations: ChatConversation[];
  initialConversationId: string | null;
  peopleByDepartment: Record<string, ChatPerson[]>;
  unitsByDepartment: Record<string, ChatUnit[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = React.useState(initialConversations);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialConversationId);
  const [reloadToken, setReloadToken] = React.useState(0);
  const roomRefresh = React.useRef<() => void>(() => {});
  const supabase = React.useMemo(() => createClient(), []);
  const viewportHeight = useKeyboardAwareHeight();

  const reloadList = React.useCallback(async () => {
    const r = await listConversationsAction();
    if (r.success && r.data) setConversations(r.data);
  }, []);

  const select = React.useCallback(
    (id: string | null) => {
      setSelectedId(id);
      router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  const selectRef = React.useRef(select);
  React.useEffect(() => {
    selectRef.current = select;
  }, [select]);

  // Read by the realtime handler without re-subscribing on every change.
  const selectedRef = React.useRef(selectedId);
  const conversationsRef = React.useRef(conversations);
  React.useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  React.useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // App-icon badge = unread messages across conversations, like WhatsApp
  // (iOS home-screen app / installed PWA; skipped where unsupported).
  React.useEffect(() => {
    const total = conversations.reduce((sum, c) => sum + c.unread, 0);
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (total > 0) void nav.setAppBadge?.(total).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [conversations]);

  // Opening a conversation clears its phone notifications (0297 tags them chat-<id>).
  React.useEffect(() => {
    if (!selectedId || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration("/sw.js").then((reg) =>
      reg?.getNotifications({ tag: `chat-${selectedId}` }).then((list) => list.forEach((n) => n.close())),
    );
  }, [selectedId]);

  // Realtime: RLS-scoped, so each user only receives rows they may read.
  React.useEffect(() => {
    let timer: number | undefined;
    // In-app banner for a message in another conversation (the open one shows it directly).
    const onMessage = (payload: { new: Record<string, unknown> }) => {
      const m = payload.new;
      const conversationId = String(m.conversation_id ?? "");
      if (!m.sender_id || m.sender_id === userId || conversationId === selectedRef.current) return;
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conv) return;
      const text = String(m.body ?? "").trim() || "📷 Foto";
      toast(conv.name, {
        description: text.length > 120 ? `${text.slice(0, 117)}…` : text,
        action: { label: "Buka", onClick: () => selectRef.current(conversationId) },
      });
    };
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setReloadToken((t) => t + 1);
        void reloadList();
      }, 400);
    };
    const channel = supabase
      .channel(`loonars-connect:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mkc_chat_messages" }, (payload) => {
        onMessage(payload as unknown as { new: Record<string, unknown> });
        bump();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mkc_hosp_room_tasks" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkc_hosp_issues" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkc_mkt_content_plans" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkc_mkt_kol_collabs" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkc_sales_visits" }, bump)
      // 0297: CRM leads, follow-ups, Loonars 2 bookings, daily reports, KOL bookings
      .on("postgres_changes", { event: "*", schema: "public", table: "mkc_connect_pulse" }, bump)
      .subscribe();
    const interval = window.setInterval(() => void reloadList(), LIST_REFRESH_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, reloadList]);


  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const registerRefresh = React.useCallback((fn: () => void) => {
    roomRefresh.current = fn;
  }, []);
  const contextValue = React.useMemo(
    () =>
      selected
        ? {
            conversationId: selected.id,
            conversationKind: selected.kind,
            departmentCode: selected.departmentCode,
            userId,
            // The owner feed has no group role; actions there come from the owner permission.
            myRole: selected.kind === "operational_group" ? selected.myRole : null,
            isOwner,
            people: peopleByDepartment[selected.departmentCode] ?? [],
            units: unitsByDepartment[selected.departmentCode] ?? [],
            refresh: () => roomRefresh.current(),
          }
        : null,
    [selected, userId, isOwner, peopleByDepartment, unitsByDepartment],
  );

  return (
    // Below lg the chat fills the screen under the 4rem top bar like a phone app
    // (cancels <main>'s padding); from lg up it is a card inside the page.
    <div
      style={viewportHeight ? ({ "--chat-vh": `${viewportHeight}px` } as React.CSSProperties) : undefined}
      className="-m-4 flex h-[calc(var(--chat-vh,100dvh)-4rem)] overflow-hidden bg-background sm:-m-6 lg:m-0 lg:h-[calc(100dvh-10rem)] lg:min-h-[520px] lg:rounded-xl lg:border lg:shadow-sm"
    >
      <div className={cn("h-full w-full md:w-[320px] md:shrink-0 md:border-r", selected ? "hidden md:block" : "block")}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b px-4 py-3">
            <p className="font-semibold">Chat</p>
            <p className="text-xs text-muted-foreground">Loonars Connect</p>
          </div>
          <ChatNotificationPrompt />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c.id)}
                className={cn("flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60", selectedId === c.id && "bg-muted")}
              >
                <ConversationAvatar conversation={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{c.name}</p>
                    {c.lastAt && (
                      <span className={cn("shrink-0 text-[11px]", c.unread > 0 ? "font-semibold text-emerald-600" : "text-muted-foreground")}>{formatListStamp(c.lastAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastBody ? `${c.lastSender ? `${c.lastSender}: ` : ""}${c.lastBody}` : c.kind === "owner_feed" ? "Laporan konsolidasi" : `${c.memberCount} anggota`}
                    </p>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">Anda belum tergabung di grup mana pun. Hubungi atasan atau admin.</p>
            )}
          </div>
        </div>
      </div>

      <div className={cn("h-full min-w-0 flex-1", selected ? "block" : "hidden md:block")}>
        {selected && contextValue ? (
          <ChatContextProvider value={contextValue}>
            <ChatRoom
              key={selected.id}
              conversation={selected}
              onBack={() => select(null)}
              reloadToken={reloadToken}
              onActivity={() => void reloadList()}
              registerRefresh={registerRefresh}
            />
          </ChatContextProvider>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 p-8 text-center">
            <MessagesSquare className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Pilih percakapan</p>
          </div>
        )}
      </div>
    </div>
  );
}
