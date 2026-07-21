"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LearningRecord } from "@/features/kontenai/types";
import { LearningVerdictBadge } from "@/features/kontenai/learning-engine/components/learning-verdict-badge";

type VerdictFilter = "all" | "approved" | "needs_revision";

function scoreTone(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 7) return "text-success";
  if (score >= 5) return "text-warning";
  return "text-destructive";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function BulletTags({ items, tone }: { items: string[]; tone: "success" | "warning" }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Tidak ada catatan.</p>;
  }
  const toneClass = tone === "success" ? "bg-success/10 text-success" : "bg-warning/10 text-warning";
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li key={i} className={`rounded-full px-2.5 py-1 text-xs ${toneClass}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Filterable/searchable list of individual LearningRecords, one card per finished PipelineRun. */
export function LearningRecordList({ records }: { records: LearningRecord[] }) {
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (verdictFilter !== "all" && record.verdict !== verdictFilter) return false;
      if (!query) return true;
      const haystack = [record.pipelineRunId, ...record.whatWorked, ...record.whatToImprove].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [records, verdictFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={verdictFilter} onValueChange={(value) => setVerdictFilter(value as VerdictFilter)}>
          <TabsList>
            <TabsTrigger value="all">Semua</TabsTrigger>
            <TabsTrigger value="approved">Disetujui</TabsTrigger>
            <TabsTrigger value="needs_revision">Perlu Revisi</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari run ID atau catatan..."
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Tidak ada catatan yang cocok"
          description="Coba ubah kata kunci pencarian atau filter verdict."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => (
            <Card key={record.id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{record.pipelineRunId}</span>
                  <LearningVerdictBadge verdict={record.verdict} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={`text-sm font-semibold tabular-nums ${scoreTone(record.finalScore)}`}>
                    {record.finalScore !== null ? `${record.finalScore.toFixed(1)}/10` : "--"}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(record.createdAt)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Yang Berhasil</p>
                  <BulletTags items={record.whatWorked} tone="success" />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Yang Perlu Diperbaiki</p>
                  <BulletTags items={record.whatToImprove} tone="warning" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
