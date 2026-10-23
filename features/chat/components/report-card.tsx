"use client";

import * as React from "react";
import { AlertTriangle, BadgeCheck, ChevronDown, Loader2, Siren } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PERIOD_LABELS, type AccountabilityItem, type HospitalityReportData, type Metric } from "@/lib/hospitality/report";
import { TASK_STATUS_LABELS, ISSUE_STATUS_LABELS } from "@/lib/hospitality/checklists";
import { cn } from "@/lib/utils";
import type { ReportRef } from "@/repositories/chat.repository";

import { acknowledgeReportAction } from "../actions/chat.actions";
import { personName, useChat } from "./chat-context";
import { formatDateTime } from "./chat-utils";

function MetricTile({ label, metric, tone }: { label: string; metric: Metric; tone?: string }) {
  const missing = metric.value === null;
  return (
    <div className={cn("rounded-lg border bg-background/60 px-2 py-1.5", missing && "border-dashed border-amber-400")} title={`${metric.source}${metric.note ? ` — ${metric.note}` : ""}`}>
      <p className={cn("text-lg font-bold leading-tight tabular-nums", tone, missing && "text-amber-600")}>{missing ? "?" : metric.value}</p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function ItemRow({ item }: { item: AccountabilityItem }) {
  return (
    <li className="rounded-md border px-2 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{item.label}</span>
        {item.severity && <span className="rounded bg-muted px-1 text-[10px] uppercase">{item.severity}</span>}
        {item.overdue && <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">lewat target</span>}
        <span className="text-muted-foreground">{item.ref === "room_task" ? TASK_STATUS_LABELS[item.status] : ISSUE_STATUS_LABELS[item.status]}</span>
      </div>
      <p>{item.title}</p>
      <p className="text-muted-foreground">
        PJ: {item.responsible ?? <span className="text-amber-600">belum ada</span>} · umur {item.ageHours} jam
        {item.targetAt ? ` · target ${formatDateTime(item.targetAt)}` : ""} · update {formatDateTime(item.latestUpdate)}
      </p>
      <p className="font-medium">→ {item.nextAction}</p>
    </li>
  );
}

function Section({ title, count, tone, children }: { title: string; count: number; tone?: string; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="space-y-1">
      <p className={cn("text-xs font-semibold", tone)}>
        {title} ({count})
      </p>
      {children}
    </div>
  );
}

export function ReportCard({ report }: { report: ReportRef }) {
  const { isOwner, people } = useChat();
  const [expanded, setExpanded] = React.useState(false);
  const [acking, setAcking] = React.useState(false);
  const [acked, setAcked] = React.useState<boolean>(!!report.acknowledgedAt);

  if (report.status !== "success" || !report.data) {
    return (
      <div className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
        <div>
          <p className="font-semibold">Laporan {PERIOD_LABELS[report.periodKind as keyof typeof PERIOD_LABELS] ?? report.periodKind} tidak tersedia</p>
          <p className="text-xs text-muted-foreground">{report.status === "failed" ? `Gagal: ${report.error ?? "-"}` : "Sedang dibuat…"}</p>
        </div>
      </div>
    );
  }

  const data = report.data as HospitalityReportData;
  const m = data.metrics;
  const e = data.exceptions;
  const dataGaps = e.failedSources.length + e.staleSources.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          Laporan Hospitality · {PERIOD_LABELS[data.periodKind]} · {data.reportDate.split("-").reverse().join("-")}
        </span>
        {e.criticalIncidents.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Siren className="h-3 w-3" /> {e.criticalIncidents.length} kritis
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Dibuat {formatDateTime(data.generatedAt)} · data {formatDateTime(data.window.from)} – {formatDateTime(data.window.to)}
      </p>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        <MetricTile label="Siap dijual" metric={m.readyForSale} tone="text-emerald-700 dark:text-emerald-300" />
        <MetricTile label="Terisi" metric={m.occupied} />
        <MetricTile label="Belum siap" metric={m.notReady} tone={m.notReady.value ? "text-amber-700 dark:text-amber-300" : undefined} />
        <MetricTile label="Total unit" metric={m.totalUnits} />
        <MetricTile label="Check-in" metric={m.checkinsCompleted} />
        <MetricTile label="Check-out" metric={m.checkoutsCompleted} />
        <MetricTile label="Masalah terbuka" metric={m.openIssues} tone={m.openIssues.value ? "text-orange-600" : undefined} />
        <MetricTile label="Laporan staf belum masuk" metric={m.missingReports} tone={m.missingReports.value ? "text-red-600" : undefined} />
      </div>
      {(e.overdueItems.length > 0 || e.missingReports.length > 0 || dataGaps > 0) && (
        <ul className="space-y-0.5 text-xs">
          {e.overdueItems.length > 0 && <li className="text-red-700 dark:text-red-300">• {e.overdueItems.length} tugas/masalah lewat target</li>}
          {e.missingReports.map((r) => (
            <li key={r.kind} className="text-red-700 dark:text-red-300">
              • Belum masuk: {r.label} ({r.submitted}/{r.expected})
            </li>
          ))}
          {dataGaps > 0 && <li className="text-amber-700 dark:text-amber-300">• {dataGaps} sumber data tidak tersedia / tidak segar — angka bertanda ? tidak dihitung</li>}
        </ul>
      )}

      <button type="button" onClick={() => setExpanded((x) => !x)} className="flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-300">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} /> {expanded ? "Tutup detail" : "Lihat detail"}
      </button>

      {expanded && (
        <div className="space-y-3 border-t pt-2">
          <Section title="Insiden kritis" count={e.criticalIncidents.length} tone="text-red-700 dark:text-red-300">
            <ul className="space-y-1">{e.criticalIncidents.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
          </Section>
          <Section title="Komplain tamu (eskalasi)" count={e.guestComplaints.length}>
            <ul className="space-y-1">{e.guestComplaints.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
          </Section>
          <Section title="Kamar tidak bisa dijual" count={e.unavailableRooms.length}>
            <ul className="text-xs">
              {e.unavailableRooms.map((r) => (
                <li key={r.unit}>
                  • Unit {r.unit}: {r.reason}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Tanggung jawab terbuka" count={data.accountability.length}>
            <ul className="space-y-1">{data.accountability.map((i) => <ItemRow key={`${i.ref}-${i.id}`} item={i} />)}</ul>
          </Section>
          <Section title="Checklist belum tuntas" count={e.incompleteChecklists.length}>
            <ul className="text-xs">
              {e.incompleteChecklists.map((c) => (
                <li key={c.unit + c.since}>
                  • Unit {c.unit}: {TASK_STATUS_LABELS[c.status]} sejak {formatDateTime(c.since)}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Selesai tanpa verifikasi FO" count={e.missingVerification.length} tone="text-amber-700 dark:text-amber-300">
            <ul className="text-xs">
              {e.missingVerification.map((v) => (
                <li key={v.unit + v.completedAt}>
                  • Unit {v.unit} ditandai bersih di Front Desk villa{v.completedAt ? ` (${formatDateTime(v.completedAt)})` : ""}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Data tidak cocok" count={e.conflicts.length} tone="text-amber-700 dark:text-amber-300">
            <ul className="text-xs">
              {e.conflicts.map((c) => (
                <li key={c}>• {c}</li>
              ))}
            </ul>
          </Section>
          <Section title="Masalah tanpa penanggung jawab" count={e.unassignedIssues.length}>
            <ul className="space-y-1">{e.unassignedIssues.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
          </Section>
          <Section title="Laporan terjadwal gagal / terlewat" count={e.failedReports.length} tone="text-red-700 dark:text-red-300">
            <ul className="text-xs">
              {e.failedReports.map((r) => (
                <li key={r.date + r.periodKind}>
                  • {PERIOD_LABELS[r.periodKind]} {r.date}: {r.error ?? "gagal"}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Sumber data bermasalah" count={dataGaps} tone="text-amber-700 dark:text-amber-300">
            <ul className="text-xs">
              {e.failedSources.map((s) => (
                <li key={s.source}>
                  • {s.source}: {s.error}
                </li>
              ))}
              {e.staleSources.map((s) => (
                <li key={s.source}>
                  • {s.source}: terakhir {s.lastRun ? formatDateTime(s.lastRun) : "tidak pernah"}
                </li>
              ))}
            </ul>
          </Section>
          <div className="space-y-0.5 text-[11px] text-muted-foreground">
            <p>Sumber angka: {[m.readyForSale.source, m.checkinsCompleted.source, m.openIssues.source].join(" · ")}</p>
            {data.caveats.map((c) => (
              <p key={c}>Catatan: {c}</p>
            ))}
            <p>{data.revenue.note}</p>
          </div>
        </div>
      )}

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
