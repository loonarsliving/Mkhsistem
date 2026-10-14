"use client";

import * as React from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RefundChatMessage } from "@/repositories/refund.repository";

import { getRefundChatAction, sendRefundChatAction } from "../actions/refund.actions";

/** While open, the conversation is re-fetched on this interval so a customer's WhatsApp reply shows up without reloading. */
const POLL_INTERVAL_MS = 8000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  });
}

export function RefundChatDialog({
  customer,
  canManage,
  onOpenChange,
}: {
  customer: { id: string; name: string; phone: string | null } | null;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = React.useState<RefundChatMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const customerId = customer?.id ?? null;

  const load = React.useCallback(async (id: string) => {
    const result = await getRefundChatAction({ customerId: id });
    if (result.success && result.data) setMessages(result.data.messages);
  }, []);

  React.useEffect(() => {
    if (!customerId) return;
    setMessages([]);
    setDraft("");
    setLoading(true);
    void load(customerId).finally(() => setLoading(false));
    const timer = setInterval(() => void load(customerId), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [customerId, load]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function handleSend() {
    if (!customerId || !draft.trim()) return;
    setSending(true);
    const result = await sendRefundChatAction({ customerId, message: draft });
    setSending(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim pesan");
      void load(customerId);
      return;
    }
    setDraft("");
    if (result.data) setMessages(result.data.messages);
  }

  return (
    <Dialog open={customer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chat — {customer?.name}</DialogTitle>
          <DialogDescription>
            WhatsApp {customer?.phone ?? "(nomor belum ada)"} · dikirim dari nomor WhatsApp perusahaan. Balasan customer otomatis masuk ke sini.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[240px] flex-1 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3">
          {loading && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat percakapan…
            </div>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Belum ada percakapan dengan customer ini.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
                    m.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-background",
                    m.deliveryStatus === "failed" && "bg-destructive/15 text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-1 text-[10px] opacity-70")}>
                    {m.direction === "outbound" ? (m.senderName ?? "CR") : "Customer"} · {formatTime(m.createdAt)}
                  </p>
                  {m.deliveryStatus === "failed" && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                      <AlertCircle className="h-3 w-3" /> Gagal terkirim{m.error ? `: ${m.error}` : ""}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {canManage && (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tulis pesan untuk customer…"
              rows={3}
              maxLength={4096}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void handleSend();
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Ctrl+Enter untuk kirim</p>
              <Button onClick={handleSend} disabled={sending || !draft.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kirim
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
