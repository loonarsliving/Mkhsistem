"use client";

import * as React from "react";
import {
  ArrowLeft,
  ClipboardList,
  FileBarChart,
  ImagePlus,
  Loader2,
  Megaphone,
  Moon,
  Plus,
  Route,
  Search,
  Send,
  ShieldCheck,
  Sunrise,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MEMBER_ROLE_LABELS, roleCan, type MemberRole, type SecurityKind } from "@/lib/hospitality/checklists";
import { cn } from "@/lib/utils";
import type { ChatConversation, ChatMessage, ChatRefs, IssueRef, RoomTaskRef } from "@/repositories/chat.repository";

import { generateReportNowAction, loadMessagesAction, loadOpenWorkAction, markReadAction, searchMessagesAction, sendTextAction } from "../actions/chat.actions";
import { AttachmentStrip, ChecklistCard, IssueCard, SystemLine, TaskCard } from "./chat-cards";
import { personName, useChat } from "./chat-context";
import { avatarColor, dayKey, formatDateTime, formatDaySeparator, formatTime, initials } from "./chat-utils";
import { ExtraEvidence, type UploadedEvidence } from "./evidence-picker";
import { ReportCard } from "./report-card";
import { IssueDialog, SecurityDialog } from "./workflow-dialogs";

/** Safety net if a realtime event is missed (flaky phone network). */
const POLL_MS = 30_000;

function Bubble({ own, children, className }: { own: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[75%]",
          own ? "rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b]" : "rounded-tl-none bg-white dark:bg-[#202c33]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function CardShell({ children, tone }: { children: React.ReactNode; tone?: "alert" | "report" }) {
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "w-full max-w-[560px] rounded-xl border bg-white p-3 text-sm shadow-sm dark:bg-[#202c33]",
          tone === "alert" && "border-red-300 dark:border-red-800",
          tone === "report" && "border-sky-300 dark:border-sky-800",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function MessageView({ message, refs, isFeed }: { message: ChatMessage; refs: ChatRefs; isFeed: boolean }) {
  const { userId, people } = useChat();
  const own = message.senderId === userId;
  const sender = message.senderId ? personName(people, message.senderId) : null;
  const meta = (
    <p className="mt-1 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">
      {sender && !own ? `${sender} · ` : ""}
      {formatTime(message.createdAt)}
    </p>
  );

  if (message.kind === "text") {
    return (
      <Bubble own={own}>
        {!own && sender && <p className={cn("mb-0.5 text-[11px] font-semibold", avatarColor(sender).replace("bg-", "text-"))}>{sender}</p>}
        {message.attachments.length > 0 && (
          <div className="mb-1">
            <AttachmentStrip attachments={message.attachments} />
          </div>
        )}
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        <p className="mt-0.5 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">{formatTime(message.createdAt)}</p>
      </Bubble>
    );
  }

  const task = message.refTable === "room_task" && message.refId ? refs.tasks[message.refId] : undefined;
  const issue = message.refTable === "issue" && message.refId ? refs.issues[message.refId] : undefined;
  const checklist = message.refTable === "checklist" && message.refId ? refs.checklists[message.refId] : undefined;
  const report = message.refTable === "report" && message.refId ? refs.reports[message.refId] : undefined;

  if (message.kind === "report_card" && report) {
    return (
      <CardShell tone="report">
        <ReportCard report={report} />
      </CardShell>
    );
  }
  if (message.kind === "task" && task) {
    return (
      <CardShell>
        <p className="mb-2 text-xs text-muted-foreground">{message.body}</p>
        <TaskCard task={task} />
        {meta}
      </CardShell>
    );
  }
  if ((message.kind === "incident" || message.kind === "alert") && issue) {
    return (
      <CardShell tone={issue.severity === "critical" || message.kind === "alert" ? "alert" : undefined}>
        {isFeed && <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-300">{message.body}</p>}
        <IssueCard issue={issue} attachments={message.attachments} />
        {meta}
      </CardShell>
    );
  }
  if (checklist && (message.kind === "checklist" || message.kind === "room_readiness" || message.kind === "work_report")) {
    const task2 = checklist.roomTaskId ? refs.tasks[checklist.roomTaskId] : undefined;
    return (
      <CardShell>
        <p className="mb-2 text-sm font-medium">{message.body}</p>
        <ChecklistCard checklist={checklist} attachments={message.attachments} />
        {task2 && task2.status !== "completed" && (
          <div className="mt-2 border-t pt-2">
            <TaskCard task={task2} />
          </div>
        )}
        {meta}
      </CardShell>
    );
  }
  if (message.kind === "alert") {
    return (
      <CardShell tone="alert">
        <p className="text-sm font-medium text-red-700 dark:text-red-300">{message.body}</p>
        {report && <ReportCard report={report} />}
        {meta}
      </CardShell>
    );
  }
  return <SystemLine body={message.body} at={message.createdAt} />;
}

function WorkPanel({ work, onClose }: { work: { tasks: RoomTaskRef[]; issues: IssueRef[] } | null; onClose: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="font-semibold">Pekerjaan terbuka</p>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-muted" aria-label="Tutup">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!work ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Kamar ({work.tasks.length})</p>
            {work.tasks.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada kamar yang menunggu.</p>}
            {work.tasks.map((t) => (
              <div key={t.id} className="rounded-lg border p-3">
                <TaskCard task={t} />
              </div>
            ))}
            <p className="pt-2 text-xs font-semibold uppercase text-muted-foreground">Masalah ({work.issues.length})</p>
            {work.issues.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada masalah terbuka.</p>}
            {work.issues.map((i) => (
              <div key={i.id} className={cn("rounded-lg border p-3", i.severity === "critical" && "border-red-300")}>
                <IssueCard issue={i} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const SECURITY_MENU: { kind: SecurityKind; label: string; icon: typeof Sunrise }[] = [
  { kind: "security_shift_start", label: "Cek awal shift", icon: Sunrise },
  { kind: "security_patrol", label: "Patroli", icon: Route },
  { kind: "security_late_checkin", label: "Bantuan check-in malam", icon: Moon },
  { kind: "security_shift_end", label: "Serah terima akhir shift", icon: ShieldCheck },
];

export function ChatRoom({
  conversation,
  onBack,
  reloadToken,
  onActivity,
  registerRefresh,
}: {
  conversation: ChatConversation;
  onBack: () => void;
  /** bumped by the parent's realtime listener */
  reloadToken: number;
  onActivity: () => void;
  registerRefresh: (fn: () => void) => void;
}) {
  const { userId, myRole, isOwner, people } = useChat();
  const isFeed = conversation.kind === "owner_feed";
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [refs, setRefs] = React.useState<ChatRefs>({ tasks: {}, issues: {}, checklists: {}, reports: {} });
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [text, setText] = React.useState("");
  const [photos, setPhotos] = React.useState<UploadedEvidence[]>([]);
  const [showPhotos, setShowPhotos] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [work, setWork] = React.useState<{ tasks: RoomTaskRef[]; issues: IssueRef[] } | null>(null);
  const [showWork, setShowWork] = React.useState(false);
  const [securityKind, setSecurityKind] = React.useState<SecurityKind | null>(null);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<{ id: string; body: string; createdAt: string; senderId: string | null }[] | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickToBottom = React.useRef(true);

  // The parent passes a fresh onActivity every render (its list reloads after
  // each mark-read). Read it through a ref so `load` -- and the mount effect
  // below -- stay stable; depending on it directly re-ran the mount effect on
  // every list refresh, wiping the room back to "Memuat percakapan…" in a loop.
  const onActivityRef = React.useRef(onActivity);
  React.useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  const load = React.useCallback(async () => {
    const r = await loadMessagesAction({ conversationId: conversation.id });
    setLoading(false);
    if (!r.success || !r.data) {
      setLoadError(r.error ?? "Gagal memuat pesan");
      return;
    }
    setLoadError(null);
    setMessages(r.data.messages);
    setRefs(r.data.refs);
    setHasMore(r.data.hasMore);
    void markReadAction({ conversationId: conversation.id }).then(() => onActivityRef.current());
  }, [conversation.id]);

  const loadWork = React.useCallback(async () => {
    if (isFeed) return;
    const r = await loadOpenWorkAction({ conversationId: conversation.id });
    if (r.success && r.data) setWork(r.data);
  }, [conversation.id, isFeed]);

  const refresh = React.useCallback(() => {
    void load();
    void loadWork();
  }, [load, loadWork]);

  // Cards and dialogs call the context's refresh(); point it at this room.
  React.useEffect(() => registerRefresh(refresh), [registerRefresh, refresh]);

  // Reset only when the conversation changes; background refreshes keep what
  // is on screen and just replace it when the new data arrives.
  React.useEffect(() => {
    setLoading(true);
    setMessages([]);
    setWork(null);
    stickToBottom.current = true;
  }, [conversation.id]);

  React.useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  React.useEffect(() => {
    if (reloadToken > 0) refresh();
  }, [reloadToken, refresh]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    setLoadingOlder(true);
    stickToBottom.current = false;
    const r = await loadMessagesAction({ conversationId: conversation.id, before: first.createdAt });
    setLoadingOlder(false);
    if (!r.success || !r.data) return void toast.error(r.error ?? "Gagal memuat");
    const older = r.data;
    setMessages((m) => [...older.messages, ...m]);
    setRefs((prev) => ({
      tasks: { ...older.refs.tasks, ...prev.tasks },
      issues: { ...older.refs.issues, ...prev.issues },
      checklists: { ...older.refs.checklists, ...prev.checklists },
      reports: { ...older.refs.reports, ...prev.reports },
    }));
    setHasMore(older.hasMore);
  }

  async function send() {
    if (sending || (!text.trim() && photos.length === 0)) return;
    setSending(true);
    stickToBottom.current = true;
    const r = await sendTextAction({ conversationId: conversation.id, body: text, attachmentIds: photos.map((p) => p.id) });
    setSending(false);
    if (!r.success) return void toast.error(r.error ?? "Pesan gagal terkirim");
    setText("");
    setPhotos([]);
    setShowPhotos(false);
    void load();
  }

  async function runSearch() {
    if (term.trim().length < 2) return;
    const r = await searchMessagesAction({ conversationId: conversation.id, term });
    if (!r.success) return void toast.error(r.error ?? "Pencarian gagal");
    setResults(r.data ?? []);
  }

  const openWorkCount = (work?.tasks.length ?? 0) + (work?.issues.length ?? 0);
  const canSecurity = roleCan(myRole, "security");
  const canLateCheckin = roleCan(myRole, "lateCheckin");

  return (
    <div className="flex h-full min-h-0">
      <div className={cn("flex h-full min-w-0 flex-1 flex-col", showWork && "hidden lg:flex")}>
        {/* Header */}
        <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
          <button type="button" onClick={onBack} className="rounded-full p-1.5 hover:bg-muted md:hidden" aria-label="Kembali ke daftar">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white", isFeed ? "bg-sky-700" : "bg-emerald-700")}>
            {isFeed ? <FileBarChart className="h-5 w-5" /> : <Users className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{conversation.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isFeed
                ? "Laporan konsolidasi & peringatan kritis"
                : `${conversation.memberCount} anggota${myRole ? ` · Anda: ${MEMBER_ROLE_LABELS[myRole as MemberRole] ?? myRole}` : ""}`}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setSearchOpen((s) => !s)} aria-label="Cari pesan">
            <Search className="h-5 w-5" />
          </Button>
          {!isFeed && (
            <Button size="sm" variant="outline" onClick={() => setShowWork(true)} className="gap-1">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Pekerjaan</span>
              {openWorkCount > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{openWorkCount}</span>}
            </Button>
          )}
          {isOwner && isFeed && (
            <Button
              size="sm"
              variant="outline"
              disabled={generating}
              onClick={async () => {
                setGenerating(true);
                const r = await generateReportNowAction({ conversationId: conversation.id });
                setGenerating(false);
                if (!r.success) return void toast.error(r.error ?? "Gagal");
                toast.success(r.data?.status === "generated" ? "Laporan dibuat" : "Laporan sedang diproses");
                void load();
              }}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
              <span className="hidden sm:inline">Buat laporan sekarang</span>
            </Button>
          )}
        </div>

        {searchOpen && (
          <div className="space-y-2 border-b bg-background p-3">
            <div className="flex gap-2">
              <Input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void runSearch()} placeholder="Cari di percakapan ini" />
              <Button onClick={() => void runSearch()} disabled={term.trim().length < 2}>
                Cari
              </Button>
            </div>
            {results && (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {results.length === 0 && <li className="text-muted-foreground">Tidak ditemukan.</li>}
                {results.map((r) => (
                  <li key={r.id} className="rounded-md bg-muted/60 px-2 py-1">
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(r.createdAt)} · {r.senderId ? personName(people, r.senderId) : "Sistem"}
                    </span>
                    <p className="line-clamp-2">{r.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-3 dark:bg-[#0b141a] sm:px-6"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat percakapan…
            </div>
          ) : loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
              <p className="text-red-600">{loadError}</p>
              <Button size="sm" variant="outline" onClick={refresh}>
                Coba lagi
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="max-w-sm rounded-lg bg-[#fff8c5] px-4 py-2 text-center text-xs text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                {isFeed
                  ? "Belum ada laporan. Laporan pagi, siang dan akhir hari muncul di sini otomatis; insiden kritis langsung."
                  : "Belum ada pesan. Tugas kamar setelah check-out muncul otomatis di sini."}
              </p>
            </div>
          ) : (
            <>
              {hasMore && (
                <div className="flex justify-center">
                  <Button size="sm" variant="outline" onClick={() => void loadOlder()} disabled={loadingOlder}>
                    {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />} Pesan sebelumnya
                  </Button>
                </div>
              )}
              {messages.map((m, idx) => {
                const showDay = idx === 0 || dayKey(messages[idx - 1].createdAt) !== dayKey(m.createdAt);
                return (
                  <React.Fragment key={m.id}>
                    {showDay && (
                      <div className="flex justify-center py-1">
                        <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                          {formatDaySeparator(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <MessageView message={m} refs={refs} isFeed={isFeed} />
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>

        {/* Composer */}
        {isFeed ? (
          <p className="border-t bg-muted/60 px-3 py-3 text-center text-xs text-muted-foreground">
            Feed ini hanya berisi laporan konsolidasi — percakapan operasional tetap di grup Hospitality.
          </p>
        ) : myRole ? (
          <div className="border-t bg-muted/60">
            {showPhotos && (
              <div className="px-3 pt-2">
                <ExtraEvidence conversationId={conversation.id} userId={userId} value={photos} onChange={setPhotos} slot="other" />
              </div>
            )}
            <div className="flex items-end gap-1.5 px-2 py-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Laporan cepat">
                    <Plus className="h-6 w-6" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-60">
                  <DropdownMenuItem onSelect={() => setIssueOpen(true)}>
                    <Megaphone className="mr-2 h-4 w-4" /> Lapor masalah / insiden
                  </DropdownMenuItem>
                  {(canSecurity || canLateCheckin) && <DropdownMenuSeparator />}
                  {(canSecurity || canLateCheckin) && <DropdownMenuLabel className="text-xs">Laporan Security</DropdownMenuLabel>}
                  {SECURITY_MENU.filter((s) => (s.kind === "security_late_checkin" ? canLateCheckin : canSecurity)).map((s) => (
                    <DropdownMenuItem key={s.kind} onSelect={() => setSecurityKind(s.kind)}>
                      <s.icon className="mr-2 h-4 w-4" /> {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={() => setShowPhotos((s) => !s)}
                className={cn("flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted", showPhotos && "text-emerald-600")}
                aria-label="Lampirkan foto"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Tulis pesan"
                className="max-h-36 min-h-[42px] flex-1 resize-none rounded-3xl border-0 bg-background px-4 py-2.5 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || (!text.trim() && photos.length === 0)}
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                aria-label="Kirim"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showWork && (
        <div className="h-full w-full lg:w-[400px] lg:shrink-0">
          <WorkPanel work={work} onClose={() => setShowWork(false)} />
        </div>
      )}

      {securityKind && <SecurityDialog kind={securityKind} open onOpenChange={(o) => !o && setSecurityKind(null)} />}
      {issueOpen && <IssueDialog open onOpenChange={setIssueOpen} defaultCategory={canSecurity && myRole === "security" ? "security" : "room"} />}
    </div>
  );
}

export function ConversationAvatar({ conversation }: { conversation: ChatConversation }) {
  const isFeed = conversation.kind === "owner_feed";
  return (
    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white", isFeed ? "bg-sky-700" : "bg-emerald-700")}>
      {isFeed ? <FileBarChart className="h-5 w-5" /> : <span className="text-sm font-semibold">{initials(conversation.name)}</span>}
    </div>
  );
}
