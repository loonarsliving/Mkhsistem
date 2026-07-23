"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listRenderJobHistoryAction } from "@/features/kontenai/render-engine/actions/render-storyboard.actions";
import { RENDER_JOBS_QUERY_KEY } from "@/features/kontenai/render-engine/hooks/use-render-job-mutations";
import type { KontenAiRenderJobWithStoryboard } from "@/repositories/kontenai-render-jobs.repository";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_VARIANT: Record<string, { label: string; className: string }> = {
  queued: { label: "Queued", className: "text-muted-foreground" },
  rendering: { label: "Rendering", className: "text-blue-600" },
  completed: { label: "Completed", className: "text-emerald-600" },
  failed: { label: "Failed", className: "text-destructive" },
};

interface RenderJobHistoryProps {
  activeJobId: string | null;
  onSelect: (job: KontenAiRenderJobWithStoryboard) => void;
}

/** "Simpan riwayat render ke database" + its display -- every render job ever queued, newest first. */
export function RenderJobHistory({ activeJobId, onSelect }: RenderJobHistoryProps) {
  const { data: jobs, isLoading, isError, error, refetch } = useQuery({
    queryKey: RENDER_JOBS_QUERY_KEY,
    queryFn: listRenderJobHistoryAction,
    refetchInterval: 4000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />
            Riwayat Render
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />
            Riwayat Render
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Gagal memuat riwayat</p>
              <p className="text-xs">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
              <button type="button" className="mt-1 text-xs underline" onClick={() => refetch()}>
                Coba lagi
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const list = jobs ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Riwayat Render ({list.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada render yang dijalankan.</p>
        ) : (
          list.map((job) => {
            const status = STATUS_VARIANT[job.status] ?? STATUS_VARIANT.queued;
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => onSelect(job)}
                className={`flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors ${
                  activeJobId === job.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{job.storyboard?.title ?? job.storyboard_id}</p>
                  <span className="text-xs text-muted-foreground">{formatDate(job.created_at)}</span>
                </div>
                <Badge variant="outline" className={status.className}>
                  {job.status === "rendering" ? `${status.label} ${Math.round(job.progress)}%` : status.label}
                </Badge>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
