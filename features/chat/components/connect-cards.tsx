"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarDays, ChevronDown, ExternalLink, Loader2, MapPin, Phone, RefreshCw, Ticket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PROSPECT_STATUS_LABEL, type ProspectStatus } from "@/constants/app";
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLATFORM_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_TOPIC_LABELS,
  INTEREST_LABELS,
  KOL_COMPENSATION_LABELS,
  KOL_DELIVERABLE_LABELS,
  KOL_STATUS_LABELS,
  PURCHASE_STATUS_LABELS,
  VISIT_STATUS_LABELS,
} from "@/lib/connect/labels";
import type { ConnectReportData } from "@/lib/connect/report-types";
import { SALES_DAILY_ITEMS } from "@/lib/connect/sales-report";
import { PERIOD_LABELS } from "@/lib/hospitality/report";
import { localParts } from "@/lib/hospitality/time";
import { cn } from "@/lib/utils";
import type { ReportRef } from "@/repositories/chat.repository";
import type { ContentPlanRef, DailyReportRef, KolRef, ProspectRef, PurchaseRef, VisitRef } from "@/repositories/connect.repository";

import { acknowledgeReportAction } from "../actions/chat.actions";
import { loadLiveReportAction, updateContentAction } from "../actions/connect.actions";
import { StatusPill } from "./chat-cards";
import { personName, useChat } from "./chat-context";
import { CHAT_TZ, formatDateTime } from "./chat-utils";
import {
  ContentActionDialog,
  ContentPlanDialog,
  FollowUpDialog,
  KolActionDialog,
  KolDecideDialog,
  VisitDialog,
  VisitResultDialog,
  type ContentDialogAction,
  type KolDialogAction,
} from "./connect-dialogs";

const lbl = (map: Record<string, string>, key: string | null | undefined) => (key ? (map[key] ?? key) : "-");
const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "-");
const today = () => localParts(new Date(), CHAT_TZ).date;

const TONE = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  muted: "bg-slate-100 text-slate-500",
};

const CONTENT_TONE: Record<string, string> = { planned: TONE.slate, in_production: TONE.sky, ready: TONE.violet, published: TONE.green, cancelled: TONE.muted };
const KOL_TONE: Record<string, string> = {
  requested: TONE.amber,
  approved: TONE.sky,
  rejected: TONE.muted,
  booked: TONE.sky,
  staying: TONE.violet,
  content_due: TONE.amber,
  completed: TONE.green,
  cancelled: TONE.muted,
};
const PROSPECT_TONE: Record<string, string> = { red: TONE.red, yellow: TONE.amber, green: TONE.sky, closing: TONE.green, inactive: TONE.muted };

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-1.5", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Markom
// ---------------------------------------------------------------------------
export function ContentPlanCard({ plan }: { plan: ContentPlanRef }) {
  const { myRole, people, refresh } = useChat();
  const [dialog, setDialog] = React.useState<ContentDialogAction | null>(null);
  const [busy, setBusy] = React.useState(false);
  const open = ["planned", "in_production", "ready"].includes(plan.status);
  const late = open && plan.plannedDate < today();
  const canAct = myRole === "markom" && open;

  async function quick(action: "start" | "ready") {
    setBusy(true);
    const r = await updateContentAction({ id: plan.id, action });
    setBusy(false);
    if (!r.success) return void toast.error(r.error ?? "Gagal");
    refresh();
  }

  return (
    <div className="space-y-1.5">
      <Row>
        <CalendarDays className="h-4 w-4 text-emerald-700" />
        <span className="font-semibold">{dmy(plan.plannedDate)}</span>
        <StatusPill label={lbl(CONTENT_STATUS_LABELS, plan.status)} tone={CONTENT_TONE[plan.status] ?? TONE.slate} />
        {late && <StatusPill label="terlambat" tone={TONE.red} />}
      </Row>
      <p className="font-medium">{plan.title}</p>
      <p className="text-xs text-muted-foreground">
        {lbl(CONTENT_PLATFORM_LABELS, plan.platform)} {lbl(CONTENT_FORMAT_LABELS, plan.format)} · {lbl(CONTENT_TOPIC_LABELS, plan.topic)} · PIC {personName(people, plan.picId)}
      </p>
      {plan.brief && <p className="whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1 text-xs">{plan.brief}</p>}
      {plan.publishedUrl && (
        <a href={plan.publishedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 underline dark:text-sky-300">
          <ExternalLink className="h-3 w-3" /> Lihat konten
        </a>
      )}
      {plan.cancelReason && <p className="text-xs text-muted-foreground">Batal: {plan.cancelReason}</p>}
      {canAct && (
        <Row className="pt-1">
          {plan.status === "planned" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void quick("start")}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Mulai produksi
            </Button>
          )}
          {plan.status === "in_production" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void quick("ready")}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Materi siap
            </Button>
          )}
          <Button size="sm" onClick={() => setDialog("publish")}>
            Sudah tayang
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog("reschedule")}>
            Pindah tanggal
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog("reassign")}>
            Ganti PIC
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDialog("cancel")}>
            Batal
          </Button>
        </Row>
      )}
      {dialog && <ContentActionDialog plan={plan} action={dialog} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}

export function KolCard({ kol }: { kol: KolRef }) {
  const { myRole, people } = useChat();
  const [decide, setDecide] = React.useState<"approve" | "reject" | null>(null);
  const [action, setAction] = React.useState<KolDialogAction | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const done = Object.keys(kol.deliverablesDone);
  const active = ["approved", "booked", "staying", "content_due"].includes(kol.status);
  const closed = ["completed", "cancelled", "rejected"].includes(kol.status);
  const contentLate = kol.status === "content_due" && !!kol.contentDueAt && Date.parse(kol.contentDueAt) < Date.now();
  const voucherExpired = kol.status === "approved" && !!kol.voucherValidUntil && kol.voucherValidUntil < today();

  return (
    <div className="space-y-1.5">
      <Row>
        <span className="font-semibold">{kol.kolHandle}</span>
        <StatusPill label={lbl(KOL_STATUS_LABELS, kol.status)} tone={KOL_TONE[kol.status] ?? TONE.slate} />
        {contentLate && <StatusPill label="konten terlambat" tone={TONE.red} />}
        {voucherExpired && <StatusPill label="kupon kedaluwarsa" tone={TONE.red} />}
      </Row>
      <p className="text-xs text-muted-foreground">
        {lbl(CONTENT_PLATFORM_LABELS, kol.platform)}
        {kol.followers != null ? ` · ${kol.followers.toLocaleString("id-ID")} followers` : ""}
        {kol.niche ? ` · ${kol.niche}` : ""} · {lbl(KOL_COMPENSATION_LABELS, kol.compensation)}
      </p>
      <p className="text-xs">
        Minta {kol.nights} malam mulai {dmy(kol.requestedCheckin)} · diajukan {personName(people, kol.createdBy)}
      </p>
      {kol.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1 text-xs">{kol.notes}</p>}

      {kol.voucherKode && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-emerald-500 px-2 py-1.5 text-xs">
          <Ticket className="h-4 w-4 text-emerald-700" />
          <span className="font-mono text-sm font-bold tracking-wider">{kol.voucherKode}</span>
          <span className="text-muted-foreground">
            unit {kol.approvedUnitNomor ?? "?"}, {dmy(kol.approvedCheckin)}, {kol.approvedNights} malam · berlaku s/d {dmy(kol.voucherValidUntil)}
          </span>
        </div>
      )}
      {kol.decidedBy && (
        <p className="text-xs text-muted-foreground">
          {kol.status === "rejected" ? "Ditolak" : "Disetujui"} {personName(people, kol.decidedBy)} {kol.decidedAt ? `· ${formatDateTime(kol.decidedAt)}` : ""}
          {kol.decisionNote ? ` — ${kol.decisionNote}` : ""}
        </p>
      )}
      {kol.bookedCheckin && (
        <p className="text-xs">
          Booking villa: unit {kol.bookedUnitNomor ?? "?"}, {dmy(kol.bookedCheckin)} s/d {dmy(kol.bookedCheckout)}
        </p>
      )}
      {kol.contentDueAt && kol.status !== "completed" && <p className={cn("text-xs", contentLate && "font-semibold text-red-600")}>Konten wajib tayang s/d {dmy(kol.contentDueAt)}</p>}

      <ul className="flex flex-wrap gap-1 text-[11px]">
        {kol.deliverables.map((d) => {
          const link = kol.deliverablesDone[d]?.url;
          return (
            <li key={d} className={cn("rounded-full border px-2 py-0.5", link ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "")}>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                  ✓ {lbl(KOL_DELIVERABLE_LABELS, d)}
                </a>
              ) : (
                lbl(KOL_DELIVERABLE_LABELS, d)
              )}
            </li>
          );
        })}
      </ul>
      {kol.cancelReason && <p className="text-xs text-muted-foreground">Batal: {kol.cancelReason}</p>}

      <Row className="pt-1">
        {myRole === "room_approver" && kol.status === "requested" && (
          <>
            <Button size="sm" onClick={() => setDecide("approve")}>
              Setujui kamar
            </Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDecide("reject")}>
              Tolak
            </Button>
          </>
        )}
        {myRole === "markom" && active && done.length < kol.deliverables.length && (
          <Button size="sm" onClick={() => setAction("deliverable")}>
            Konten tayang
          </Button>
        )}
        {myRole === "markom" && active && (
          <Button size="sm" variant="ghost" onClick={() => setPlanOpen(true)}>
            Masukkan ke kalender
          </Button>
        )}
        {(myRole === "markom" || myRole === "room_approver") && !closed && (
          <Button size="sm" variant="ghost" onClick={() => setAction("note")}>
            Catatan
          </Button>
        )}
        {myRole === "markom" && !closed && (
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setAction("cancel")}>
            Batalkan
          </Button>
        )}
      </Row>
      {decide && <KolDecideDialog kol={kol} decision={decide} open onOpenChange={(o) => !o && setDecide(null)} />}
      {action && <KolActionDialog kol={kol} action={action} open onOpenChange={(o) => !o && setAction(null)} />}
      {planOpen && <ContentPlanDialog kol={kol} defaultDate={kol.bookedCheckout ?? kol.approvedCheckin ?? undefined} open onOpenChange={setPlanOpen} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
function useSalesCanAct(salesId: string | null | undefined) {
  const { myRole, userId } = useChat();
  return myRole === "manager" || (myRole === "sales" && salesId === userId);
}

export function ProspectCard({ prospect, overdue }: { prospect: ProspectRef; overdue?: boolean }) {
  const { people } = useChat();
  const canAct = useSalesCanAct(prospect.salesId);
  const [fu, setFu] = React.useState(false);
  const [visit, setVisit] = React.useState(false);
  const open = ["red", "yellow", "green"].includes(prospect.status);
  return (
    <div className="space-y-1.5">
      <Row>
        <span className="font-semibold">{prospect.name}</span>
        <StatusPill label={PROSPECT_STATUS_LABEL[prospect.status as ProspectStatus] ?? prospect.status} tone={PROSPECT_TONE[prospect.status] ?? TONE.slate} />
        {prospect.temperature === "hot" && <StatusPill label="panas" tone={TONE.red} />}
        {overdue && <StatusPill label="terlambat follow-up" tone={TONE.red} />}
      </Row>
      <p className="text-xs text-muted-foreground">
        {prospect.houseType ?? "-"} · {prospect.city ?? "-"} · sales {prospect.salesId ? personName(people, prospect.salesId) : "belum ada"}
      </p>
      <p className="text-xs">
        {prospect.followUps} follow-up · terakhir {prospect.lastFollowUpAt ? formatDateTime(prospect.lastFollowUpAt) : "belum pernah"}
        {prospect.nextVisitAt ? ` · kunjungan ${formatDateTime(prospect.nextVisitAt)}` : ""}
      </p>
      <Row className="pt-1">
        {canAct && open && (
          <>
            <Button size="sm" onClick={() => setFu(true)}>
              <Phone className="h-4 w-4" /> Follow-up
            </Button>
            <Button size="sm" variant="outline" onClick={() => setVisit(true)}>
              <MapPin className="h-4 w-4" /> Jadwalkan kunjungan
            </Button>
          </>
        )}
        {canAct && (
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/crm/${prospect.id}`}>
              <ExternalLink className="h-4 w-4" /> Buka di CRM
            </Link>
          </Button>
        )}
      </Row>
      {fu && <FollowUpDialog prospect={prospect} open onOpenChange={setFu} />}
      {visit && <VisitDialog prospect={prospect} open onOpenChange={setVisit} />}
    </div>
  );
}

export function VisitCard({ visit }: { visit: VisitRef }) {
  const { people, myRole, userId } = useChat();
  const [result, setResult] = React.useState(false);
  const canAct = myRole === "manager" || (myRole === "sales" && visit.salesId === userId);
  const missed = visit.status === "scheduled" && Date.parse(visit.scheduledAt) < Date.now() - 3 * 3_600_000;
  return (
    <div className="space-y-1.5">
      <Row>
        <MapPin className="h-4 w-4 text-emerald-700" />
        <span className="font-semibold">{visit.prospectName}</span>
        <StatusPill label={lbl(VISIT_STATUS_LABELS, visit.status)} tone={visit.status === "done" ? TONE.green : visit.status === "scheduled" ? TONE.sky : TONE.muted} />
        {missed && <StatusPill label="belum diisi hasilnya" tone={TONE.red} />}
      </Row>
      <p className="text-xs">
        {formatDateTime(visit.scheduledAt)} · sales {personName(people, visit.salesId)}
        {visit.interest ? ` · minat ${lbl(INTEREST_LABELS, visit.interest)}` : ""}
      </p>
      {visit.note && <p className="text-xs text-muted-foreground">{visit.note}</p>}
      {visit.resultNote && <p className="whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1 text-xs">{visit.resultNote}</p>}
      {canAct && visit.status === "scheduled" && (
        <Button size="sm" onClick={() => setResult(true)}>
          Isi hasil kunjungan
        </Button>
      )}
      {result && <VisitResultDialog visit={visit} open onOpenChange={setResult} />}
    </div>
  );
}

export function PurchaseCard({ purchase }: { purchase: PurchaseRef }) {
  const { people } = useChat();
  const tone = purchase.status === "verified" ? TONE.green : purchase.status === "rejected" ? TONE.red : TONE.amber;
  return (
    <div className="space-y-1">
      <Row>
        <span className="font-semibold">Unit {purchase.blok}</span>
        {purchase.tipe && <span className="text-xs text-muted-foreground">{purchase.tipe}</span>}
        <StatusPill label={lbl(PURCHASE_STATUS_LABELS, purchase.status)} tone={tone} />
      </Row>
      <p className="text-xs">
        Sales {purchase.marketingEmployeeId ? personName(people, purchase.marketingEmployeeId) : "-"}
        {purchase.transactionDate ? ` · transaksi ${dmy(purchase.transactionDate)}` : ""}
        {purchase.verifiedAt ? ` · diverifikasi ${formatDateTime(purchase.verifiedAt)}` : ""}
        {purchase.feeStatus ? ` · fee: ${purchase.feeStatus}` : ""}
      </p>
      {purchase.rejectReason && <p className="text-xs text-red-600">Alasan: {purchase.rejectReason}</p>}
    </div>
  );
}

export function DailyReportCard({ report }: { report: DailyReportRef }) {
  const { people } = useChat();
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {personName(people, report.salesId)} · {dmy(report.reportDate)}
      </p>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          ["Follow-up", report.followUps],
          ["Kunjungan", report.visits],
          ["Prospek panas", report.hotProspects],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border px-2 py-1">
            <p className="text-lg font-bold tabular-nums">{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-0.5 text-xs">
        {SALES_DAILY_ITEMS.map((i) => (
          <li key={i.key} className={report.items[i.key] ? "" : "text-red-600"}>
            {report.items[i.key] ? "✓" : "✗"} {i.label}
          </li>
        ))}
      </ul>
      {report.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1 text-xs">{report.notes}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owner feed report for Markom / Sales (lib/connect/report-types.ts)
// ---------------------------------------------------------------------------
const SECTION_TONE: Record<string, string> = {
  bad: "text-red-700 dark:text-red-300",
  warn: "text-amber-700 dark:text-amber-300",
  info: "",
};

/** Metrics, red flags and the expandable detail; shared by the stored and the live report. */
export function ConnectReportBody({ data }: { data: ConnectReportData }) {
  const [expanded, setExpanded] = React.useState(false);
  const flagged = data.sections.filter((s) => s.tone === "bad" && s.items.length > 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {data.metrics.map((m) => (
          <div
            key={m.key}
            className={cn("rounded-lg border bg-background/60 px-2 py-1.5", m.value === null && "border-dashed border-amber-400")}
            title={`${m.source}${m.note ? ` — ${m.note}` : ""}`}
          >
            <p
              className={cn(
                "text-lg font-bold leading-tight tabular-nums",
                m.value === null && "text-amber-600",
                m.tone === "bad" && "text-red-600",
                m.tone === "good" && "text-emerald-700 dark:text-emerald-300",
              )}
            >
              {m.value === null ? "?" : m.value}
              {m.total != null && m.value !== null ? <span className="text-sm font-medium text-muted-foreground">/{m.total}</span> : null}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>
      {(flagged.length > 0 || data.failedSources.length > 0) && (
        <ul className="space-y-0.5 text-xs">
          {flagged.map((s) => (
            <li key={s.key} className="text-red-700 dark:text-red-300">
              • {s.title}: {s.items.length}
            </li>
          ))}
          {data.failedSources.length > 0 && <li className="text-amber-700 dark:text-amber-300">• {data.failedSources.length} sumber data tidak tersedia — angka bertanda ? tidak dihitung</li>}
        </ul>
      )}
      <button type="button" onClick={() => setExpanded((x) => !x)} className="flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-300">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} /> {expanded ? "Tutup detail" : "Lihat detail"}
      </button>
      {expanded && (
        <div className="space-y-3 border-t pt-2">
          {data.sections
            .filter((s) => s.items.length > 0)
            .map((s) => (
              <div key={s.key} className="space-y-1">
                <p className={cn("text-xs font-semibold", SECTION_TONE[s.tone])}>
                  {s.title} ({s.items.length})
                </p>
                <ul className="space-y-0.5 text-xs">
                  {s.items.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          {data.failedSources.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Sumber data bermasalah
              </p>
              <ul className="text-xs">
                {data.failedSources.map((f) => (
                  <li key={f.source}>
                    • {f.source}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-0.5 text-[11px] text-muted-foreground">
            <p>Sumber angka: {[...new Set(data.metrics.map((m) => m.source))].join(" · ")}</p>
            {data.caveats.map((c) => (
              <p key={c}>Catatan: {c}</p>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function ConnectReportCard({ report, title }: { report: ReportRef; title: string }) {
  const { isOwner, people } = useChat();
  const [acking, setAcking] = React.useState(false);
  const [acked, setAcked] = React.useState(!!report.acknowledgedAt);
  const data = report.data as ConnectReportData;

  return (
    <div className="space-y-2">
      <span className="font-semibold">
        {title} · {PERIOD_LABELS[data.periodKind] ?? data.periodKind} · {dmy(data.reportDate)}
      </span>
      <p className="text-[11px] text-muted-foreground">
        Dibuat {formatDateTime(data.generatedAt)} · data {formatDateTime(data.window.from)} – {formatDateTime(data.window.to)}
      </p>
      <ConnectReportBody data={data} />
      <div className="flex items-center justify-between gap-2 border-t pt-2">
        {acked || report.acknowledgedAt ? (
          <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
            <BadgeCheck className="h-4 w-4" /> Dibaca {report.acknowledgedBy ? personName(people, report.acknowledgedBy) : "owner"}
            {report.acknowledgedAt ? ` · ${formatDateTime(report.acknowledgedAt)}` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Belum dikonfirmasi owner</span>
        )}
        {isOwner && !acked && !report.acknowledgedAt && (
          <Button
            size="sm"
            variant="outline"
            disabled={acking}
            onClick={async () => {
              setAcking(true);
              const r = await acknowledgeReportAction({ reportId: report.id });
              setAcking(false);
              if (!r.success) return void toast.error(r.error ?? "Gagal");
              setAcked(true);
            }}
          >
            {acking && <Loader2 className="h-4 w-4 animate-spin" />} Konfirmasi dibaca
          </Button>
        )}
      </div>
    </div>
  );
}

/** Live report refresh: on activity (realtime) at most every 15s, otherwise every minute. */
const LIVE_MIN_GAP_MS = 15_000;
const LIVE_POLL_MS = 60_000;

/**
 * Pinned at the top of a Markom/Sales owner feed: today so far, computed on
 * the server with the same rules as the 20:00 report (lib/connect), not
 * stored. Refreshes when the room's realtime listener bumps `reloadToken`
 * (content, KOL, visits), every minute (CRM leads have no realtime), and
 * when the tab becomes visible again.
 */
export function LiveConnectReportCard({ conversationId, title, reloadToken }: { conversationId: string; title: string; reloadToken: number }) {
  const [data, setData] = React.useState<ConnectReportData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const lastRun = React.useRef(0);
  const inFlight = React.useRef(false);

  const load = React.useCallback(
    async (force = false) => {
      if (inFlight.current) return;
      if (!force && Date.now() - lastRun.current < LIVE_MIN_GAP_MS) return;
      inFlight.current = true;
      lastRun.current = Date.now();
      setLoading(true);
      const r = await loadLiveReportAction({ conversationId });
      inFlight.current = false;
      setLoading(false);
      if (!r.success || !r.data) return void setError(r.error ?? "Gagal memuat laporan live");
      setError(null);
      setData(r.data);
    },
    [conversationId],
  );

  React.useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(true), LIVE_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  React.useEffect(() => {
    if (reloadToken > 0) void load();
  }, [reloadToken, load]);

  return (
    <div className="space-y-2 rounded-xl border border-emerald-300 bg-white p-3 text-sm shadow-sm dark:border-emerald-800 dark:bg-[#202c33]">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 truncate text-left font-semibold">
          {title} · Live hari ini
        </button>
        <button type="button" onClick={() => void load(true)} disabled={loading} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Perbarui">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label={open ? "Ciutkan" : "Buka"}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {data && (
        <p className="text-[11px] text-muted-foreground">
          Diperbarui {formatDateTime(data.generatedAt)} · sejak {formatDateTime(data.window.from)} · laporan akhir hari tetap tersimpan pukul 20:00
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!data && !error && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menghitung…
        </p>
      )}
      {data && open && <ConnectReportBody data={data} />}
    </div>
  );
}
