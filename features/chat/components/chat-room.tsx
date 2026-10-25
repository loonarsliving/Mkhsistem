"use client";

import * as React from "react";
import {
  ArrowLeft,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  Handshake,
  MapPin,
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
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { departmentKind, isPlainChat, memberRoleLabel } from "@/lib/connect/labels";
import type { ConnectReportData } from "@/lib/connect/report-types";
import { roleCan, type SecurityKind } from "@/lib/hospitality/checklists";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { listChatMessages, type ChatConversation, type ChatMessage, type ChatRefs, type ChatReplyRef, type IssueRef, type RoomTaskRef } from "@/repositories/chat.repository";
import { EMPTY_CONNECT_REFS, type MarkomOpenWork, type SalesOpenWork } from "@/repositories/connect.repository";

import { generateReportNowAction, loadOpenWorkAction, searchMessagesAction, sendTextAction, sendWaLeadMessageAction } from "../actions/chat.actions";
import { loadConnectWorkAction } from "../actions/connect.actions";
import { AttachmentStrip, ChecklistCard, IssueCard, SystemLine, TaskCard } from "./chat-cards";
import { personName, useChat } from "./chat-context";
import { ConnectReportCard, ContentPlanCard, LiveConnectReportCard, DailyReportCard, KolCard, ProspectCard, PurchaseCard, VisitCard } from "./connect-cards";
import { ContentPlanDialog, DailyReportDialog, KolDialog, LeadDialog } from "./connect-dialogs";
import { MarkomWorkPanel, SalesWorkPanel } from "./connect-panels";
import { avatarColor, dayKey, formatDateTime, formatDaySeparator, formatTime, initials } from "./chat-utils";
import { ExtraEvidence, type UploadedEvidence } from "./evidence-picker";
import { ReportCard } from "./report-card";
import { ReplyButton, SwipeToReply } from "./swipe-reply";
import { formatPhone, InboundMedia, MoveLeadMenu, useNow, WaDeliveryState, WaitingBadge } from "./wa-lead";
import { IssueDialog, SecurityDialog } from "./workflow-dialogs";

/** Safety net if a realtime event is missed (flaky phone network). */
const POLL_MS = 30_000;
/** Give up waiting for a message load and offer "Coba lagi" after this long. */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * Last loaded page per user + conversation (this browser tab): reopening a chat
 * shows it at once while the fresh page loads in the background.
 */
const roomCache = new Map<string, { messages: ChatMessage[]; refs: ChatRefs; hasMore: boolean }>();

/** Message page straight from Supabase (RLS: members only), or null after a failure / LOAD_TIMEOUT_MS. */
async function fetchMessages(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  before?: string,
): Promise<{ messages: ChatMessage[]; refs: ChatRefs; hasMore: boolean } | { error: string } | null> {
  return Promise.race([
    listChatMessages(supabase, conversationId, { before }).catch((err: unknown) => ({ error: err instanceof Error ? err.message : "Gagal memuat pesan" })),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
  ]);
}

function Bubble({ own, children, className, onReply }: { own: boolean; children: React.ReactNode; className?: string; onReply?: () => void }) {
  return (
    <div className={cn("flex items-center gap-1", own ? "justify-end" : "justify-start")}>
      {own && onReply && <ReplyButton onReply={onReply} />}
      <div
        className={cn(
          "max-w-[88%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[75%]",
          own ? "rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b]" : "rounded-tl-none bg-white dark:bg-[#202c33]",
          className,
        )}
      >
        {children}
      </div>
      {!own && onReply && <ReplyButton onReply={onReply} />}
    </div>
  );
}

/** Snippet of a message for quotes and the reply bar (0301). */
function replySnippet(body: string, hasPhoto: boolean): string {
  const text = body.trim();
  if (text) return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  return hasPhoto ? "📷 Foto" : "Pesan";
}

/** The quoted original above a reply; tap jumps to it when it is loaded. */
function ReplyQuote({ reply, onJump }: { reply: ChatReplyRef; onJump: (id: string) => void }) {
  const { userId, people } = useChat();
  const name = reply.senderId === userId ? "Anda" : reply.senderId ? personName(people, reply.senderId) : "Sistem";
  return (
    <button
      type="button"
      onClick={() => onJump(reply.id)}
      className="mb-1 block w-full rounded-md border-l-4 border-emerald-500 bg-black/5 px-2 py-1 text-left dark:bg-white/10"
    >
      <span className={cn("block text-[11px] font-semibold", reply.senderId === userId ? "text-emerald-700 dark:text-emerald-400" : avatarColor(name).replace("bg-", "text-"))}>
        {name}
      </span>
      <span className="line-clamp-2 block text-xs text-[#54656f] dark:text-[#aebac1]">{replySnippet(reply.body, reply.hasPhoto)}</span>
    </button>
  );
}

function CardShell({ children, tone }: { children: React.ReactNode; tone?: "alert" | "report" }) {
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "w-full min-w-0 max-w-[560px] break-words rounded-xl border bg-white p-3 text-sm shadow-sm dark:bg-[#202c33]",
          tone === "alert" && "border-red-300 dark:border-red-800",
          tone === "report" && "border-sky-300 dark:border-sky-800",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Markom/Sales record behind a message (0294), or null. */
function connectCard(message: ChatMessage, refs: ChatRefs): React.ReactNode | null {
  const id = message.refId;
  if (!id) return null;
  const c = refs.connect;
  switch (message.refTable) {
    case "content_plan":
      return c.contentPlans[id] ? <ContentPlanCard plan={c.contentPlans[id]} /> : null;
    case "kol":
      return c.kols[id] ? <KolCard kol={c.kols[id]} /> : null;
    case "prospect":
      return c.prospects[id] ? <ProspectCard prospect={c.prospects[id]} /> : null;
    case "visit":
      return c.visits[id] ? <VisitCard visit={c.visits[id]} /> : null;
    case "purchase":
      return c.purchases[id] ? <PurchaseCard purchase={c.purchases[id]} /> : null;
    case "daily_report":
      return c.dailyReports[id] ? <DailyReportCard report={c.dailyReports[id]} /> : null;
    default:
      return null;
  }
}

function MessageView({
  message,
  refs,
  isFeed,
  reportTitle,
  onReply,
  onJump,
}: {
  message: ChatMessage;
  refs: ChatRefs;
  isFeed: boolean;
  reportTitle: string;
  onReply?: (message: ChatMessage) => void;
  onJump: (id: string) => void;
}) {
  const { userId, people, conversationKind } = useChat();
  // WhatsApp lead (0303): "out" = to the customer (right), "in" = from the customer (left)
  const wa = message.payload.wa as string | undefined;
  const own = wa ? wa === "out" : message.senderId === userId;
  // 1-on-1: the header already names the other person (WhatsApp style). On a
  // lead, a reply by someone else (as a monitor sees it) is named on its bubble.
  const sender = wa
    ? wa === "out" && message.senderId !== userId
      ? message.senderId
        ? personName(people, message.senderId)
        : "Pesan otomatis"
      : null
    : message.senderId && conversationKind !== "direct"
      ? personName(people, message.senderId)
      : null;
  const mediaUrl = typeof message.payload.media_url === "string" ? message.payload.media_url : null;
  const meta = (
    <p className="mt-1 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">
      {sender && !own ? `${sender} · ` : ""}
      {formatTime(message.createdAt)}
    </p>
  );

  if (message.kind === "text") {
    const reply = onReply ? () => onReply(message) : undefined;
    const bubble = (
      <Bubble own={own} onReply={reply}>
        {(!own || wa) && sender && <p className={cn("mb-0.5 text-[11px] font-semibold", avatarColor(sender).replace("bg-", "text-"))}>{sender}</p>}
        {message.replyTo && <ReplyQuote reply={message.replyTo} onJump={onJump} />}
        {message.attachments.length > 0 && (
          <div className="mb-1">
            <AttachmentStrip attachments={message.attachments} />
          </div>
        )}
        {mediaUrl && <InboundMedia url={mediaUrl} />}
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        <p className="mt-0.5 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">
          {formatTime(message.createdAt)}
          {wa === "out" && (
            <>
              {" "}
              <WaDeliveryState message={message} />
            </>
          )}
        </p>
      </Bubble>
    );
    return reply ? <SwipeToReply onReply={reply}>{bubble}</SwipeToReply> : bubble;
  }

  const task = message.refTable === "room_task" && message.refId ? refs.tasks[message.refId] : undefined;
  const issue = message.refTable === "issue" && message.refId ? refs.issues[message.refId] : undefined;
  const checklist = message.refTable === "checklist" && message.refId ? refs.checklists[message.refId] : undefined;
  const report = message.refTable === "report" && message.refId ? refs.reports[message.refId] : undefined;

  if (message.kind === "report_card" && report) {
    const kind = (report.data as Partial<ConnectReportData> | null)?.kind;
    return (
      <CardShell tone="report">
        {report.status === "success" && (kind === "markom" || kind === "sales") ? <ConnectReportCard report={report} title={reportTitle} /> : <ReportCard report={report} />}
      </CardShell>
    );
  }
  // Markom/Sales: the creating post (task / work report / Loonars 2 status)
  // carries the live card; follow-up system posts stay one-line history.
  if (message.kind === "task" || message.kind === "work_report" || message.kind === "alert" || message.refTable === "purchase") {
    const card = connectCard(message, refs);
    if (card) {
      return (
        <CardShell tone={message.kind === "alert" ? "report" : undefined}>
          <p className="mb-2 text-xs text-muted-foreground">{message.body}</p>
          {card}
          {meta}
        </CardShell>
      );
    }
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

type HospitalityWork = { tasks: RoomTaskRef[]; issues: IssueRef[] };
type AnyWork = HospitalityWork | MarkomOpenWork | SalesOpenWork;

function isConnectWork(w: AnyWork): w is MarkomOpenWork | SalesOpenWork {
  return "kind" in w;
}

function openWorkCount(w: AnyWork | null): number {
  if (!w) return 0;
  if (!isConnectWork(w)) return w.tasks.length + w.issues.length;
  if (w.kind === "markom") return w.kols.filter((k) => k.status === "requested").length + w.content.filter((c) => c.plannedDate < w.today).length;
  return w.leads.filter((l) => l.overdue).length + w.visits.length;
}

function WorkPanel({ work, onClose }: { work: AnyWork | null; onClose: () => void }) {
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
        ) : isConnectWork(work) ? (
          work.kind === "markom" ? (
            <MarkomWorkPanel work={work} />
          ) : (
            <SalesWorkPanel work={work} />
          )
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
  const deptKind = departmentKind(conversation.departmentCode);
  const plainChat = isPlainChat(deptKind);
  const isDirect = conversation.kind === "direct";
  // WhatsApp ad lead (0303): answered by its sales person, watched by monitors
  const lead = conversation.waLead;
  const now = useNow();
  const supabase = React.useMemo(() => createClient(), []);
  const cached = roomCache.get(`${userId}:${conversation.id}`);
  const [messages, setMessages] = React.useState<ChatMessage[]>(cached?.messages ?? []);
  const [refs, setRefs] = React.useState<ChatRefs>(cached?.refs ?? { tasks: {}, issues: {}, checklists: {}, reports: {}, connect: EMPTY_CONNECT_REFS });
  const [hasMore, setHasMore] = React.useState(cached?.hasMore ?? false);
  const [loading, setLoading] = React.useState(!cached);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [text, setText] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [photos, setPhotos] = React.useState<UploadedEvidence[]>([]);
  const [showPhotos, setShowPhotos] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [work, setWork] = React.useState<AnyWork | null>(null);
  const [showWork, setShowWork] = React.useState(false);
  const [securityKind, setSecurityKind] = React.useState<SecurityKind | null>(null);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [connectDialog, setConnectDialog] = React.useState<"content" | "kol" | "lead" | "daily" | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<{ id: string; body: string; createdAt: string; senderId: string | null }[] | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  // Composer grows with the text up to max-h-36, then scrolls (WhatsApp-style).
  React.useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const stickToBottom = React.useRef(true);

  // The parent passes a fresh onActivity every render (its list reloads after
  // each mark-read). Read it through a ref so `load` -- and the mount effect
  // below -- stay stable; depending on it directly re-ran the mount effect on
  // every list refresh, wiping the room back to "Memuat percakapan…" in a loop.
  const onActivityRef = React.useRef(onActivity);
  React.useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  const loadedRef = React.useRef(!!cached);
  // Straight from the browser to Supabase (RLS decides access): no server
  // action round trip, no session re-check per load, no queueing behind other
  // actions. A dropped request (weak signal) gives up after LOAD_TIMEOUT_MS.
  const load = React.useCallback(async () => {
    const r = await fetchMessages(supabase, conversation.id);
    setLoading(false);
    if (!r || "error" in r) {
      // A failed background refresh keeps what is already on screen.
      if (!loadedRef.current) setLoadError(r ? r.error : "Koneksi lambat, pesan belum termuat.");
      return;
    }
    loadedRef.current = true;
    roomCache.set(`${userId}:${conversation.id}`, r);
    setLoadError(null);
    setMessages(r.messages);
    setRefs(r.refs);
    setHasMore(r.hasMore);
    void supabase.rpc("mkc_chat_mark_read", { p_conversation_id: conversation.id }).then(() => onActivityRef.current());
  }, [supabase, conversation.id, userId]);

  const loadWork = React.useCallback(async () => {
    if (isFeed || plainChat) return;
    const r = deptKind === "hospitality" ? await loadOpenWorkAction({ conversationId: conversation.id }) : await loadConnectWorkAction({ conversationId: conversation.id });
    if (r.success && r.data) setWork(r.data);
  }, [conversation.id, isFeed, deptKind, plainChat]);

  const refresh = React.useCallback(() => {
    void load();
    void loadWork();
  }, [load, loadWork]);

  // Cards and dialogs call the context's refresh(); point it at this room.
  React.useEffect(() => registerRefresh(refresh), [registerRefresh, refresh]);

  // Reset only when the conversation changes; background refreshes keep what
  // is on screen and just replace it when the new data arrives.
  React.useEffect(() => {
    const fromCache = roomCache.get(`${userId}:${conversation.id}`);
    setLoading(!fromCache);
    setMessages(fromCache?.messages ?? []);
    if (fromCache) {
      setRefs(fromCache.refs);
      setHasMore(fromCache.hasMore);
    }
    setWork(null);
    loadedRef.current = !!fromCache;
    stickToBottom.current = true;
  }, [conversation.id, userId]);

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
    const older = await fetchMessages(supabase, conversation.id, first.createdAt);
    setLoadingOlder(false);
    if (!older || "error" in older) return void toast.error(older ? older.error : "Koneksi lambat, coba lagi");
    setMessages((m) => [...older.messages, ...m]);
    setRefs((prev) => ({
      tasks: { ...older.refs.tasks, ...prev.tasks },
      issues: { ...older.refs.issues, ...prev.issues },
      checklists: { ...older.refs.checklists, ...prev.checklists },
      reports: { ...older.refs.reports, ...prev.reports },
      connect: {
        contentPlans: { ...older.refs.connect.contentPlans, ...prev.connect.contentPlans },
        kols: { ...older.refs.connect.kols, ...prev.connect.kols },
        prospects: { ...older.refs.connect.prospects, ...prev.connect.prospects },
        visits: { ...older.refs.connect.visits, ...prev.connect.visits },
        purchases: { ...older.refs.connect.purchases, ...prev.connect.purchases },
        dailyReports: { ...older.refs.connect.dailyReports, ...prev.connect.dailyReports },
      },
    }));
    setHasMore(older.hasMore);
  }

  async function send() {
    if (sending || (!text.trim() && photos.length === 0)) return;
    setSending(true);
    stickToBottom.current = true;
    const attachmentIds = photos.map((p) => p.id);
    const r = lead
      ? await sendWaLeadMessageAction({ conversationId: conversation.id, body: text, attachmentIds })
      : await sendTextAction({ conversationId: conversation.id, body: text, attachmentIds, replyToId: replyTo?.id });
    setSending(false);
    if (!r.success) return void toast.error(r.error ?? "Pesan gagal terkirim");
    const delivery = r.data as { delivered?: boolean; error?: string } | undefined;
    if (delivery?.delivered === false) toast.error("Pesan tersimpan tapi gagal terkirim ke WhatsApp customer", { description: delivery.error });
    setText("");
    setReplyTo(null);
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

  // Swipe / hover reply (0301): quote the message above the composer and focus it.
  const startReply = React.useCallback((message: ChatMessage) => {
    setReplyTo(message);
    composerRef.current?.focus();
  }, []);

  // Tap on a quote: scroll to the original and flash it, if it is loaded.
  const jumpTo = React.useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return void toast("Pesan aslinya ada di riwayat yang lebih lama", { description: "Ketuk “Pesan sebelumnya” di atas untuk memuatnya." });
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("chat-msg-flash");
    window.setTimeout(() => el.classList.remove("chat-msg-flash"), 1600);
  }, []);

  const workCount = openWorkCount(work);
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
          {isDirect ? (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white", avatarColor(conversation.name))}>
              {initials(conversation.name)}
            </div>
          ) : (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white", isFeed ? "bg-sky-700" : "bg-emerald-700")}>
              {isFeed ? <FileBarChart className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{conversation.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isFeed
                ? "Laporan konsolidasi & peringatan kritis"
                : lead
                  ? [formatPhone(lead.phone), lead.salesName ? `Sales: ${lead.salesName}` : null].filter(Boolean).join(" · ")
                : isDirect
                  ? conversation.description || "Pesan pribadi"
                  : `${conversation.memberCount} anggota${myRole ? ` · Anda: ${memberRoleLabel(myRole, conversation.departmentCode)}` : ""}`}
            </p>
          </div>
          {lead?.monitor && <MoveLeadMenu conversation={conversation} onMoved={onActivity} />}
          <Button size="icon" variant="ghost" onClick={() => setSearchOpen((s) => !s)} aria-label="Cari pesan">
            <Search className="h-5 w-5" />
          </Button>
          {!isFeed && !plainChat && (
            <Button size="sm" variant="outline" onClick={() => setShowWork(true)} className="gap-1">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">{deptKind === "markom" ? "Kalender & KOL" : deptKind === "sales" ? "Lead & kunjungan" : "Pekerjaan"}</span>
              {workCount > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{workCount}</span>}
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

        {lead && (lead.source || lead.waitingSince) && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-[#25d366]/10 px-3 py-1.5 text-xs">
            {lead.source && <span className="min-w-0 truncate text-muted-foreground">Iklan: {lead.source}</span>}
            <WaitingBadge since={lead.waitingSince} now={now} />
          </div>
        )}

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

        {isFeed && deptKind !== "hospitality" && isOwner && (
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-b bg-[#efeae2] px-3 pt-3 pb-2 dark:bg-[#0b141a] sm:px-6">
            <LiveConnectReportCard conversationId={conversation.id} title={conversation.name} reloadToken={reloadToken} />
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain bg-[#efeae2] px-2.5 py-3 dark:bg-[#0b141a] sm:px-6"
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
                  ? deptKind === "hospitality"
                    ? "Belum ada laporan. Laporan pagi, siang dan akhir hari muncul di sini otomatis; insiden kritis langsung."
                    : "Laporan live ada di atas dan selalu mengikuti data terbaru. Laporan akhir hari (20:00) tersimpan di sini otomatis setiap malam."
                  : lead
                    ? "Percakapan WhatsApp dengan customer ini."
                  : isDirect
                    ? `Pesan pribadi dengan ${conversation.name}. Hanya terlihat oleh Anda berdua.`
                  : deptKind === "koordinasi"
                    ? "Grup koordinasi lintas tim Hospitality, Markom, Sales Jogja dan owner. Mulai percakapan di sini."
                  : deptKind === "markom"
                    ? "Belum ada pesan. Susun kalender konten dan ajukan kamar KOL lewat tombol +."
                    : deptKind === "sales"
                      ? "Belum ada pesan. Lead baru dari CRM muncul otomatis di sini; catat follow-up dan kunjungan lewat kartunya."
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
                    <div id={`msg-${m.id}`} className="rounded-lg transition-colors">
                      <MessageView
                        message={m}
                        refs={refs}
                        isFeed={isFeed}
                        reportTitle={conversation.name}
                        onReply={!isFeed && myRole && !lead ? startReply : undefined}
                        onJump={jumpTo}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>

        {/* Composer */}
        {isFeed ? (
          <p className="border-t bg-muted/60 px-3 py-3 text-center text-xs text-muted-foreground">
            Feed ini hanya berisi laporan konsolidasi — percakapan operasional tetap di grup {conversation.departmentName}.
          </p>
        ) : lead && !lead.canReply ? (
          <p className="border-t bg-muted/60 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
            Mode pantau — hanya {lead.salesName ?? "sales"} yang membalas customer ini.{lead.monitor ? " Gunakan “Pindahkan” untuk mengalihkan lead." : ""}
          </p>
        ) : myRole ? (
          <div className="border-t bg-muted/60 pb-[env(safe-area-inset-bottom)]">
            {replyTo && (
              <div className="flex items-center gap-2 px-3 pt-2">
                <div className="min-w-0 flex-1 rounded-md border-l-4 border-emerald-500 bg-background px-2 py-1">
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Membalas {replyTo.senderId === userId ? "pesan Anda" : replyTo.senderId ? personName(people, replyTo.senderId) : "Sistem"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{replySnippet(replyTo.body, replyTo.attachments.length > 0)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  aria-label="Batal membalas"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {showPhotos && (
              <div className="px-3 pt-2">
                <ExtraEvidence conversationId={conversation.id} userId={userId} value={photos} onChange={setPhotos} slot="other" />
              </div>
            )}
            <div className="flex items-end gap-1.5 px-2 py-2">
              {!plainChat && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Laporan cepat">
                      <Plus className="h-6 w-6" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-60">
                    {deptKind === "hospitality" && (
                      <>
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
                      </>
                    )}
                    {deptKind === "markom" &&
                      (myRole === "markom" ? (
                        <>
                          <DropdownMenuItem onSelect={() => setConnectDialog("content")}>
                            <CalendarPlus className="mr-2 h-4 w-4" /> Rencana konten
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setConnectDialog("kol")}>
                            <Handshake className="mr-2 h-4 w-4" /> Kolaborasi KOL (minta kamar)
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem onSelect={() => setShowWork(true)}>
                          <Handshake className="mr-2 h-4 w-4" /> Lihat KOL menunggu persetujuan
                        </DropdownMenuItem>
                      ))}
                    {deptKind === "sales" && (
                      <>
                        <DropdownMenuItem onSelect={() => setConnectDialog("lead")}>
                          <UserPlus className="mr-2 h-4 w-4" /> Lead baru
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setShowWork(true)}>
                          <MapPin className="mr-2 h-4 w-4" /> Follow-up / jadwalkan kunjungan
                        </DropdownMenuItem>
                        {myRole === "sales" && (
                          <DropdownMenuItem onSelect={() => setConnectDialog("daily")}>
                            <ClipboardCheck className="mr-2 h-4 w-4" /> Laporan harian
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button
                type="button"
                onClick={() => setShowPhotos((s) => !s)}
                className={cn("flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted", showPhotos && "text-emerald-600")}
                aria-label="Lampirkan foto"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <textarea
                ref={composerRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && replyTo) {
                    e.preventDefault();
                    setReplyTo(null);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={lead ? "Balas ke WhatsApp customer" : "Tulis pesan"}
                className="max-h-36 min-h-[42px] min-w-0 flex-1 resize-none rounded-3xl border-0 bg-background px-4 py-2.5 text-base leading-snug shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 sm:text-sm"
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
      {connectDialog === "content" && <ContentPlanDialog open onOpenChange={(o) => !o && setConnectDialog(null)} />}
      {connectDialog === "kol" && <KolDialog open onOpenChange={(o) => !o && setConnectDialog(null)} />}
      {connectDialog === "lead" && <LeadDialog open onOpenChange={(o) => !o && setConnectDialog(null)} />}
      {connectDialog === "daily" && <DailyReportDialog open onOpenChange={(o) => !o && setConnectDialog(null)} />}
      {issueOpen && <IssueDialog open onOpenChange={setIssueOpen} defaultCategory={canSecurity && myRole === "security" ? "security" : "room"} />}
    </div>
  );
}

export function ConversationAvatar({ conversation }: { conversation: ChatConversation }) {
  const isFeed = conversation.kind === "owner_feed";
  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white",
        conversation.kind === "direct" ? avatarColor(conversation.name) : isFeed ? "bg-sky-700" : "bg-emerald-700",
      )}
    >
      {isFeed ? <FileBarChart className="h-5 w-5" /> : <span className="text-sm font-semibold">{initials(conversation.name)}</span>}
    </div>
  );
}
