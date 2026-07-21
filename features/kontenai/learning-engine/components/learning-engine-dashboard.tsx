"use client";

import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getLearningSummaryAction, listLearningRecordsAction } from "@/features/kontenai/learning-engine/actions/learning-engine.actions";
import { LearningSummaryPanel } from "@/features/kontenai/learning-engine/components/learning-summary-panel";
import { LearningRecordList } from "@/features/kontenai/learning-engine/components/learning-record-list";

function SummarySkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-[76px] w-full" />
        <Skeleton className="h-[76px] w-full" />
        <Skeleton className="h-[76px] w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-[180px] w-full" />
        <Skeleton className="h-[180px] w-full" />
      </div>
    </div>
  );
}

function RecordListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[132px] w-full" />
      <Skeleton className="h-[132px] w-full" />
      <Skeleton className="h-[132px] w-full" />
    </div>
  );
}

/**
 * Sprint 8 - Learning Engine dashboard. Fetches the aggregated summary and
 * the full LearningRecord list from the mocked server actions, and renders
 * the summary tiles/theme cards plus the filterable record list.
 */
export function LearningEngineDashboard() {
  const summaryQuery = useQuery({ queryKey: ["kontenai-learning-summary"], queryFn: getLearningSummaryAction });
  const recordsQuery = useQuery({ queryKey: ["kontenai-learning-records"], queryFn: listLearningRecordsAction });

  return (
    <div className="space-y-8">
      <section>{summaryQuery.isLoading ? <SummarySkeleton /> : summaryQuery.data ? <LearningSummaryPanel summary={summaryQuery.data} /> : null}</section>

      <section>
        {recordsQuery.isLoading ? (
          <RecordListSkeleton />
        ) : recordsQuery.data && recordsQuery.data.length > 0 ? (
          <LearningRecordList records={recordsQuery.data} />
        ) : (
          <EmptyState
            icon={BrainCircuit}
            title="Belum ada catatan pembelajaran"
            description="Catatan akan muncul otomatis setiap kali sebuah production run selesai dinilai oleh Content Studio."
          />
        )}
      </section>
    </div>
  );
}
