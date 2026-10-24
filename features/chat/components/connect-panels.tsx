"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UNIT_STATUS_LABELS } from "@/lib/connect/labels";
import { addDays } from "@/lib/hospitality/time";
import { cn } from "@/lib/utils";
import type { MarkomOpenWork, SalesOpenWork } from "@/repositories/connect.repository";

import { personName, useChat } from "./chat-context";
import { ContentPlanCard, KolCard, ProspectCard, VisitCard } from "./connect-cards";
import { ContentPlanDialog } from "./connect-dialogs";

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="pt-2 text-xs font-semibold uppercase text-muted-foreground">{children}</p>;
}

function Box({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border p-3", className)}>{children}</div>;
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });

/** Content calendar (late + next 14 days, empty days shown) and open KOLs. */
export function MarkomWorkPanel({ work }: { work: MarkomOpenWork }) {
  const { myRole } = useChat();
  const [planDate, setPlanDate] = React.useState<string | null>(null);
  const late = work.content.filter((c) => c.plannedDate < work.today);
  const days = Array.from({ length: 15 }, (_, i) => addDays(work.today, i));
  const waiting = work.kols.filter((k) => k.status === "requested");
  const others = work.kols.filter((k) => k.status !== "requested");

  return (
    <>
      {late.length > 0 && (
        <>
          <Heading>Terlambat ({late.length})</Heading>
          {late.map((c) => (
            <Box key={c.id} className="border-red-300">
              <ContentPlanCard plan={c} />
            </Box>
          ))}
        </>
      )}
      <Heading>Kalender konten 14 hari</Heading>
      {days.map((d) => {
        const items = work.content.filter((c) => c.plannedDate === d);
        return (
          <div key={d} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className={cn("text-sm font-medium", d === work.today && "text-emerald-700 dark:text-emerald-300")}>
                {d === work.today ? "Hari ini · " : ""}
                {dayLabel(d)}
              </p>
              {myRole === "markom" && (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPlanDate(d)} aria-label={`Rencana konten ${d}`}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">Belum ada konten</p>
            ) : (
              items.map((c) => (
                <Box key={c.id}>
                  <ContentPlanCard plan={c} />
                </Box>
              ))
            )}
          </div>
        );
      })}
      <Heading>KOL menunggu persetujuan kamar ({waiting.length})</Heading>
      {waiting.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada.</p>}
      {waiting.map((k) => (
        <Box key={k.id} className="border-amber-300">
          <KolCard kol={k} />
        </Box>
      ))}
      <Heading>KOL berjalan ({others.length})</Heading>
      {others.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada.</p>}
      {others.map((k) => (
        <Box key={k.id}>
          <KolCard kol={k} />
        </Box>
      ))}
      {planDate && <ContentPlanDialog open defaultDate={planDate} onOpenChange={(o) => !o && setPlanDate(null)} />}
    </>
  );
}

/** Scheduled visits, Loonars 2 availability, and active leads (overdue first). */
export function SalesWorkPanel({ work }: { work: SalesOpenWork }) {
  const { myRole, userId, people } = useChat();
  const [mineOnly, setMineOnly] = React.useState(myRole === "sales");
  const leads = mineOnly ? work.leads.filter((l) => l.salesId === userId) : work.leads;
  const overdue = leads.filter((l) => l.overdue);
  const unitTotal = Object.values(work.units).reduce((a, b) => a + b, 0);

  return (
    <>
      <Heading>Unit Loonars 2</Heading>
      {unitTotal === 0 ? (
        <p className="text-sm text-amber-700">Data siteplan tidak tersedia.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {["tersedia", "dp", "verifikasi", "terjual"].map((s) => (
            <div key={s} className="rounded-lg border px-1 py-1">
              <p className="text-lg font-bold tabular-nums">{work.units[s] ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">{UNIT_STATUS_LABELS[s]}</p>
            </div>
          ))}
        </div>
      )}
      <Heading>Kunjungan terjadwal ({work.visits.length})</Heading>
      {work.visits.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada.</p>}
      {work.visits.map((v) => (
        <Box key={v.id}>
          <VisitCard visit={v} />
        </Box>
      ))}
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Lead aktif ({leads.length}) · terlambat {overdue.length}
        </p>
        {myRole === "sales" && (
          <button type="button" onClick={() => setMineOnly((m) => !m)} className="text-xs font-medium text-sky-700 dark:text-sky-300">
            {mineOnly ? "Tampilkan semua" : "Lead saya saja"}
          </button>
        )}
      </div>
      {leads.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada lead aktif 90 hari terakhir.</p>}
      {leads.map((l) => (
        <Box key={l.id} className={l.overdue ? "border-red-300" : undefined}>
          <ProspectCard prospect={l} overdue={l.overdue} />
        </Box>
      ))}
      {myRole === "manager" && overdue.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Terlambat per sales:{" "}
          {Object.entries(
            overdue.reduce<Record<string, number>>((acc, l) => {
              const n = l.salesId ? personName(people, l.salesId) : "belum ada sales";
              acc[n] = (acc[n] ?? 0) + 1;
              return acc;
            }, {}),
          )
            .map(([n, c]) => `${n} ${c}`)
            .join(", ")}
        </p>
      )}
    </>
  );
}
