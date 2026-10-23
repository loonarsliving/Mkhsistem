"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessagesSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ChatConversation, ChatPerson, ChatUnit } from "@/repositories/chat.repository";

import { listConversationsAction } from "../actions/chat.actions";
import { ChatContextProvider } from "./chat-context";
import { ChatRoom, ConversationAvatar } from "./chat-room";
import { formatListStamp } from "./chat-utils";

/** Conversation list refresh while open (unread badges), on top of realtime. */
const LIST_REFRESH_MS = 30_000;

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

  const reloadList = React.useCallback(async () => {
    const r = await listConversationsAction();
    if (r.success && r.data) setConversations(r.data);
  }, []);

  // Realtime: RLS-scoped, so each user only receives rows they may read.
  React.useEffect(() => {
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setReloadToken((t) => t + 1);
        void reloadList();
      }, 400);
    };
    const channel = supabase
      .channel(`loonars-connect:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mkc_chat_messages" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkc_hosp_room_tasks" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkc_hosp_issues" }, bump)
      .subscribe();
    const interval = window.setInterval(() => void reloadList(), LIST_REFRESH_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, reloadList]);

  const select = React.useCallback(
    (id: string | null) => {
      setSelectedId(id);
      router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

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
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] overflow-hidden rounded-xl border bg-background shadow-sm sm:h-[calc(100dvh-10rem)]">
      <div className={cn("h-full w-full border-r md:w-[320px] md:shrink-0", selected ? "hidden md:block" : "block")}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b px-4 py-3">
            <p className="font-semibold">Chat</p>
            <p className="text-xs text-muted-foreground">Loonars Connect</p>
          </div>
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
              <p className="p-6 text-center text-sm text-muted-foreground">Anda belum tergabung di grup mana pun. Hubungi Hospitality Manager atau admin.</p>
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
