"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Check, Clock, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getWaLeadStats, type ChatConversation, type ChatMessage, type WaLeadSalesStats } from "@/repositories/chat.repository";

import { reassignWaLeadAction } from "../actions/chat.actions";
import { formatListStamp } from "./chat-utils";

/**
 * WhatsApp ad leads in Loonars Connect (0303). The customer writes on
 * WhatsApp; the sales person holding the lead answers from Chat (sent through
 * the system's WhatsApp number); the owner and the lead manager watch every
 * lead, see who is slow to answer and can move a lead -- they never answer.
 */

/** Warning thresholds; the database alerts use the department settings (15 / 30 by default). */
const SALES_ALERT_MIN = 15;
const MONITOR_ALERT_MIN = 30;

/** Re-renders every `ms` so "waiting X min" badges keep counting. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function formatWait(min: number): string {
  if (min < 60) return `${min} mnt`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} jam ${min % 60} mnt` : `${Math.floor(h / 24)} hari`;
}

/** "Belum dibalas X mnt": amber, red from the owner alert threshold. */
export function WaitingBadge({ since, now, className }: { since: string | null; now: number; className?: string }) {
  const min = minutesSince(since, now);
  if (min === null) return null;
  return (
    // Server and browser clocks can straddle a minute boundary on first render.
    <span
      suppressHydrationWarning
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        min >= MONITOR_ALERT_MIN ? "bg-red-600 text-white" : min >= SALES_ALERT_MIN ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
        className,
      )}
    >
      <Clock className="h-3 w-3" /> Belum dibalas {formatWait(min)}
    </span>
  );
}

export function WaTag() {
  return <span className="shrink-0 rounded bg-[#25d366] px-1 text-[10px] font-bold leading-4 text-white">WA</span>;
}

export function formatPhone(digits: string): string {
  return digits ? `+${digits}` : "";
}

/** Delivery state of a message sent to the customer's WhatsApp. */
export function WaDeliveryState({ message }: { message: ChatMessage }) {
  const status = message.payload.wa_status as string | undefined;
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-0.5 font-semibold text-red-600" title={String(message.payload.wa_error ?? "")}>
        <AlertTriangle className="h-3 w-3" /> Gagal terkirim
      </span>
    );
  }
  if (status === "sent") return <Check className="inline h-3 w-3 text-[#53bdeb]" aria-label="Terkirim" />;
  return <Clock className="inline h-3 w-3" aria-label="Mengirim" />;
}

/** A photo the customer sent: its WhatsApp-hosted link opens in a new tab (outside the app's image policy). */
export function InboundMedia({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-black/5 px-2 py-1 text-xs font-medium text-emerald-700 underline dark:bg-white/10 dark:text-emerald-400">
      <ImageIcon className="h-4 w-4" /> Buka foto dari customer
    </a>
  );
}

/** Move the lead to another sales person in the rotation (monitors only). */
export function MoveLeadMenu({ conversation, onMoved }: { conversation: ChatConversation; onMoved: () => void }) {
  const lead = conversation.waLead;
  const supabase = React.useMemo(() => createClient(), []);
  const [sales, setSales] = React.useState<WaLeadSalesStats[] | null>(null);
  const [moving, setMoving] = React.useState(false);
  if (!lead?.monitor) return null;
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && !sales) void getWaLeadStats(supabase, conversation.departmentCode).then(setSales, () => setSales([]));
      }}
    >
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={moving} className="flex h-9 shrink-0 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50">
          {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
          <span className="hidden sm:inline">Pindahkan</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Pindahkan lead ke</DropdownMenuLabel>
        {!sales && (
          <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Memuat…
          </p>
        )}
        {sales?.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Tidak ada sales di rotasi.</p>}
        {sales?.map((s) => (
          <DropdownMenuItem
            key={s.salesId}
            disabled={s.salesId === lead.salesId}
            onSelect={async () => {
              setMoving(true);
              const r = await reassignWaLeadAction({ leadId: lead.leadId, salesId: s.salesId });
              setMoving(false);
              if (!r.success) return void toast.error(r.error ?? "Gagal memindahkan lead");
              toast.success(`Lead dipindahkan ke ${s.name}`);
              onMoved();
            }}
          >
            {s.name}
            {s.salesId === lead.salesId ? " (sekarang)" : s.waiting > 0 ? ` · ${s.waiting} menunggu` : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Monitor view (owner / lead manager): numbers per sales person, then every
 * lead with the unanswered ones first. Opened from the conversation list.
 */
export function WaLeadMonitor({
  departmentCode,
  leads,
  selectedId,
  onSelect,
  onBack,
  reloadToken,
}: {
  departmentCode: string;
  leads: ChatConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  reloadToken: number;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [stats, setStats] = React.useState<WaLeadSalesStats[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const now = useNow();

  React.useEffect(() => {
    let alive = true;
    getWaLeadStats(supabase, departmentCode).then(
      (s) => alive && (setStats(s), setError(null)),
      (err: unknown) => alive && setError(err instanceof Error ? err.message : "Gagal memuat"),
    );
    return () => {
      alive = false;
    };
  }, [supabase, departmentCode, reloadToken]);

  const sorted = [...leads].sort((a, b) => {
    const wa = a.waLead?.waitingSince ?? null;
    const wb = b.waLead?.waitingSince ?? null;
    if (wa && wb) return wa.localeCompare(wb);
    if (wa || wb) return wa ? -1 : 1;
    return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
  });
  const waiting = leads.filter((l) => l.waLead?.waitingSince).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-2">
        <button type="button" onClick={onBack} className="rounded-full p-2 hover:bg-muted" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Lead WA Jogja</p>
          <p className="text-xs text-muted-foreground">Mode pantau · {waiting > 0 ? `${waiting} belum dibalas` : "semua sudah dibalas"}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-2 border-b bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Kinerja sales</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!stats && !error && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Memuat…
            </p>
          )}
          {stats?.length === 0 && <p className="text-xs text-muted-foreground">Belum ada sales di rotasi.</p>}
          {stats?.map((s) => {
            const oldest = minutesSince(s.oldestWaitingSince, now);
            return (
              <div key={s.salesId} className="rounded-lg border bg-background p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  {s.waiting > 0 ? (
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white", oldest !== null && oldest >= MONITOR_ALERT_MIN ? "bg-red-600" : "bg-amber-500")}>
                      {s.waiting} menunggu{oldest !== null ? ` · ${formatWait(oldest)}` : ""}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Tidak ada yang menunggu</span>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">
                  Hari ini {s.leadsToday} lead · 7 hari {s.leads7d} lead · Rata-rata balas pertama{" "}
                  {s.avgFirstResponseMin7d === null ? "—" : formatWait(Math.round(s.avgFirstResponseMin7d))}
                </p>
              </div>
            );
          })}
        </div>
        {sorted.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Belum ada lead WhatsApp.</p>}
        {sorted.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn("flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60", selectedId === c.id && "bg-muted")}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                  <WaTag /> <span className="truncate">{c.name}</span>
                </p>
                {c.lastAt && <span className="shrink-0 text-[11px] text-muted-foreground">{formatListStamp(c.lastAt)}</span>}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {c.waLead?.salesName ?? "—"}
                {c.lastBody ? ` · ${c.lastBody}` : ""}
              </p>
              <WaitingBadge since={c.waLead?.waitingSince ?? null} now={now} className="mt-1" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
