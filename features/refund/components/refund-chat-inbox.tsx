"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Camera, Check, CheckCheck, ImagePlus, Loader2, MessageCircle, Search, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { uploadEntityFile } from "@/lib/supabase/storage";
import { cn, formatCurrency } from "@/lib/utils";
import type { RefundChatMessage, RefundCustomer } from "@/repositories/refund.repository";

import { getRefundChatAction, sendRefundChatAction } from "../actions/refund.actions";
import { REFUND_CHAT_PHOTO_PLACEHOLDER } from "../schemas/refund.schema";
import { REFUND_CHAT_EVENT, REFUND_CHAT_READ_EVENT } from "./refund-chat-alerts";

/** Open conversation is re-fetched on this interval so a customer's reply appears without reloading. */
const MESSAGE_POLL_MS = 6000;
/** Conversation list (previews, unread badges) refreshes on this interval while the Chat tab is open. */
const LIST_REFRESH_MS = 15000;
const TZ = "Asia/Makassar";

const AVATAR_COLORS = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600"];

function initials(name: string): string {
  const words = name
    .replace(/[^A-Za-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(dr|drs|h|st|ss|sos|spd|mpd|mm|apt|si|msi|sy)$/i.test(w));
  return ((words[0]?.[0] ?? name[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ name, className }: { name: string; className?: string }) {
  const color = AVATAR_COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", color, className)}>{initials(name)}</div>
  );
}

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** WhatsApp list style: time today, "Kemarin", otherwise a short date. */
function formatListStamp(iso: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const key = dayKey(iso);
  if (key === today) return formatTime(iso);
  if (key === yesterday) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: TZ });
}

function formatDaySeparator(iso: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const key = dayKey(iso);
  if (key === today) return "Hari ini";
  if (key === yesterday) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}

/** Plain-text preview for the list ("[Foto]\nhttps://…" -> "📷 Foto"). */
function previewText(body: string | null): string {
  if (!body) return "";
  if (body.startsWith("[Foto]")) return `📷 ${body.split("\n")[0].replace("[Foto]", "Foto").trim()}`;
  if (body.startsWith("📎 [Bukti transfer")) return "📎 Bukti transfer";
  return body.replace(/\s+/g, " ");
}

/** Renders text with clickable links. External images can't be embedded (CSP), so photos open in a new tab. */
function MessageBody({ body }: { body: string }) {
  if (body.startsWith("[Foto]")) {
    const [first, ...rest] = body.split("\n");
    const url = rest.find((l) => /^https?:\/\//.test(l.trim()))?.trim();
    const caption = first.replace("[Foto]", "").trim();
    return (
      <div className="space-y-1">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md bg-black/5 px-3 py-2 font-medium underline-offset-2 hover:underline dark:bg-white/10">
            <Camera className="h-4 w-4" /> Buka foto / file dari customer
          </a>
        ) : (
          <span className="flex items-center gap-2 font-medium">
            <Camera className="h-4 w-4" /> Foto
          </span>
        )}
        {caption && <p className="whitespace-pre-wrap break-words">{caption}</p>}
      </div>
    );
  }
  const parts = body.split(/(https?:\/\/\S+)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-sky-700 underline dark:text-sky-300">
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </p>
  );
}

const PHOTO_BUCKET = "refund-transfer-proofs";
const PHOTO_MAX_SIDE = 1600;

/** Phone photos are 5-12MB; shrink to 1600px JPEG in the browser before upload so they send fast. */
function shrinkPhoto(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(src);
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Browser tidak bisa memproses foto"));
      ctx.fillStyle = "#fff"; // transparent PNG -> white, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(new File([blob], "foto.jpg", { type: "image/jpeg" })) : reject(new Error("Foto gagal diproses"))),
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("File ini bukan foto yang bisa dibuka"));
    };
    img.src = src;
  });
}

/** Signed photo links change on every poll; keep the one already shown so the image doesn't reload every few seconds. */
function keepMediaUrls(prev: RefundChatMessage[], next: RefundChatMessage[]): RefundChatMessage[] {
  const shown = new Map(prev.filter((m) => m.mediaUrl).map((m) => [m.id, m.mediaUrl]));
  return next.map((m) => (m.mediaUrl && shown.has(m.id) ? { ...m, mediaUrl: shown.get(m.id) ?? m.mediaUrl } : m));
}

function ConversationList({
  customers,
  selectedId,
  onSelect,
}: {
  customers: RefundCustomer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const sorted = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q))
      .slice()
      .sort((a, b) => {
        if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt);
        if (a.lastMessageAt) return -1;
        if (b.lastMessageAt) return 1;
        return a.sortOrder - b.sortOrder;
      });
  }, [customers, query]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari customer" className="rounded-full bg-muted/60 pl-9" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn("flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60", selectedId === c.id && "bg-muted")}
          >
            <Avatar name={c.name} className="h-11 w-11 text-sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-medium">{c.name}</p>
                {c.lastMessageAt && (
                  <span className={cn("shrink-0 text-[11px]", c.unreadMessages > 0 ? "font-semibold text-emerald-600" : "text-muted-foreground")}>
                    {formatListStamp(c.lastMessageAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                  {c.lastMessageDirection === "outbound" && <CheckCheck className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{c.lastMessagePreview ? previewText(c.lastMessagePreview) : `Sisa ${formatCurrency(c.remainingAmount)} · belum ada chat`}</span>
                </p>
                {c.unreadMessages > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">
                    {c.unreadMessages}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
        {sorted.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Tidak ada customer.</p>}
      </div>
    </div>
  );
}

function ConversationPane({
  customer,
  canManage,
  onBack,
}: {
  customer: RefundCustomer;
  canManage: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<RefundChatMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  // Photo picked but not sent yet: shrunk file + local preview URL.
  const [photo, setPhoto] = React.useState<{ file: File; preview: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const customerId = customer.id;
  const hadUnread = React.useRef(customer.unreadMessages > 0);

  const load = React.useCallback(async () => {
    const result = await getRefundChatAction({ customerId });
    if (result.success && result.data) {
      const next = result.data.messages;
      setMessages((prev) => keepMediaUrls(prev, next));
    }
    return result.success;
  }, [customerId]);

  // Opening a chat / receiving into the open chat marks messages read -- let the icon badge drop.
  const loadAndMarkRead = React.useCallback(async () => {
    if (await load()) window.dispatchEvent(new Event(REFUND_CHAT_READ_EVENT));
  }, [load]);

  React.useEffect(() => {
    setMessages([]);
    setDraft("");
    setPhoto(null);
    setLoading(true);
    void loadAndMarkRead().finally(() => {
      setLoading(false);
      // Opening marks the customer's messages read -- refresh the list badge.
      if (hadUnread.current) router.refresh();
    });
    const timer = setInterval(() => void load(), MESSAGE_POLL_MS);
    // New message pushed by RefundChatAlerts -- show it now, not at the next poll.
    const onNew = (e: Event) => {
      if ((e as CustomEvent<{ customerId: string | null }>).detail?.customerId === customerId) void loadAndMarkRead();
    };
    window.addEventListener(REFUND_CHAT_EVENT, onNew);
    return () => {
      clearInterval(timer);
      window.removeEventListener(REFUND_CHAT_EVENT, onNew);
    };
  }, [load, loadAndMarkRead, router, customerId]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Auto-grow the composer like WhatsApp, up to ~6 lines.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [draft]);

  // Free the local preview when it's replaced, removed, or the chat closes.
  React.useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.preview);
  }, [photo]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const small = await shrinkPhoto(file);
      setPhoto({ file: small, preview: URL.createObjectURL(small) });
      textareaRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Foto tidak bisa dipakai");
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if ((!text && !photo) || sending) return;
    setSending(true);
    let mediaPath: string | undefined;
    if (photo) {
      try {
        mediaPath = (await uploadEntityFile(PHOTO_BUCKET, customerId, photo.file)).path;
      } catch (err) {
        setSending(false);
        toast.error(`Foto gagal diunggah: ${err instanceof Error ? err.message : "coba lagi"}`);
        return;
      }
    }
    const result = await sendRefundChatAction({ customerId, message: text, mediaPath });
    setSending(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim pesan");
      void load();
      return;
    }
    setDraft("");
    setPhoto(null);
    if (result.data) {
      const next = result.data.messages;
      setMessages((prev) => keepMediaUrls(prev, next));
    }
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-muted/60 px-3 py-2">
        <button type="button" onClick={onBack} className="rounded-full p-1.5 hover:bg-muted md:hidden" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={customer.name} className="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{customer.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {customer.phone ?? "No. HP belum ada"} · Sisa {formatCurrency(customer.remainingAmount)}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 dark:bg-[#0b141a] sm:px-6"
        style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
      >
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat percakapan…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="rounded-lg bg-[#fff8c5] px-4 py-2 text-center text-xs text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
              Belum ada percakapan. Pesan dikirim dari nomor WhatsApp perusahaan.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const out = m.direction === "outbound";
              const grouped = !newDay && prev && prev.direction === m.direction;
              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div className="flex justify-center py-2">
                      <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                        {formatDaySeparator(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className={cn("flex", out ? "justify-end" : "justify-start", !grouped && "pt-1.5")}>
                    <div
                      className={cn(
                        "relative max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-sm text-[#111b21] shadow-sm dark:text-[#e9edef] sm:max-w-[65%]",
                        out ? "bg-[#d9fdd3] dark:bg-[#005c4b]" : "bg-white dark:bg-[#202c33]",
                        !grouped && (out ? "rounded-tr-none" : "rounded-tl-none"),
                      )}
                    >
                      {out && m.senderName && !grouped && <p className="mb-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{m.senderName}</p>}
                      {m.mediaUrl && (
                        <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="-mx-1 mb-1 block">
                          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage link */}
                          <img src={m.mediaUrl} alt="Foto terkirim" loading="lazy" className="max-h-72 w-auto max-w-full rounded-md object-cover" />
                        </a>
                      )}
                      {!(m.mediaUrl && m.body === REFUND_CHAT_PHOTO_PLACEHOLDER) && <MessageBody body={m.body} />}
                      <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-[#8696a0]">
                        <span>{formatTime(m.createdAt)}</span>
                        {out &&
                          (m.deliveryStatus === "failed" ? (
                            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                          ) : m.deliveryStatus === "sent" ? (
                            <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          ))}
                      </div>
                      {out && m.deliveryStatus === "failed" && (
                        <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">Gagal terkirim{m.error ? `: ${m.error}` : ""}</p>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      {canManage && photo && (
        <div className="flex items-center gap-3 border-t bg-muted/60 px-3 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) */}
          <img src={photo.preview} alt="Foto yang akan dikirim" className="h-16 w-16 rounded-md border object-cover" />
          <p className="flex-1 text-xs text-muted-foreground">
            Foto siap dikirim{draft.trim() ? " dengan keterangan di bawah" : " — tulis keterangan kalau perlu"}
          </p>
          <button type="button" onClick={() => setPhoto(null)} disabled={sending} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Batalkan foto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {canManage ? (
        <div className="flex items-end gap-2 border-t bg-muted/60 px-3 py-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Kirim foto"
            title="Kirim foto"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            maxLength={4096}
            placeholder="Ketik pesan"
            className="max-h-36 min-h-[42px] flex-1 resize-none rounded-3xl border-0 bg-background px-4 py-2.5 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || (!draft.trim() && !photo)}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition-opacity hover:bg-emerald-700 disabled:opacity-50"
            aria-label="Kirim"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      ) : (
        <p className="border-t bg-muted/60 px-3 py-3 text-center text-xs text-muted-foreground">Hanya petugas Refund yang bisa membalas.</p>
      )}
    </div>
  );
}

/**
 * WhatsApp-style inbox for the refund module: conversation list on the left
 * (newest first, unread badges), the open chat on the right. On phones it
 * switches between the two like the WhatsApp app.
 */
export function RefundChatInbox({
  customers,
  canManage,
  selectedId,
  onSelect,
  className,
}: {
  customers: RefundCustomer[];
  canManage: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Overrides the default height (the full-screen /refund/chat page uses more of the viewport). */
  className?: string;
}) {
  const router = useRouter();
  const selected = customers.find((c) => c.id === selectedId) ?? null;

  React.useEffect(() => {
    const timer = setInterval(() => router.refresh(), LIST_REFRESH_MS);
    const onNew = () => router.refresh();
    window.addEventListener(REFUND_CHAT_EVENT, onNew);
    return () => {
      clearInterval(timer);
      window.removeEventListener(REFUND_CHAT_EVENT, onNew);
    };
  }, [router]);

  return (
    <div className={cn("flex h-[calc(100dvh-13rem)] min-h-[520px] overflow-hidden rounded-xl border bg-background shadow-sm", className)}>
      <div className={cn("h-full w-full border-r md:w-[340px] md:shrink-0", selected ? "hidden md:block" : "block")}>
        <ConversationList customers={customers} selectedId={selectedId} onSelect={onSelect} />
      </div>
      <div className={cn("h-full min-w-0 flex-1", selected ? "block" : "hidden md:block")}>
        {selected ? (
          <ConversationPane key={selected.id} customer={selected} canManage={canManage} onBack={() => onSelect(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600">
              <MessageCircle className="h-8 w-8" />
            </div>
            <p className="font-medium">Chat Customer Refund</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Pilih customer di kiri untuk mulai chat. Pesan dikirim dari nomor WhatsApp perusahaan, dan balasan customer otomatis masuk ke sini.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
