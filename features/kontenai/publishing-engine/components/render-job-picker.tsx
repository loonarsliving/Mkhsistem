"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Film } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listCompletedRenderJobsAction } from "@/features/kontenai/publishing-engine/actions/publishing.actions";
import { COMPLETED_RENDER_JOBS_QUERY_KEY } from "@/features/kontenai/publishing-engine/hooks/use-publishing-mutations";

interface RenderJobPickerProps {
  selectedRenderJobId: string | null;
  onSelect: (renderJobId: string) => void;
}

/** Step 1: "Ambil video hasil Render Engine" -- lists every completed render job as a candidate source video. */
export function RenderJobPicker({ selectedRenderJobId, onSelect }: RenderJobPickerProps) {
  const { data: jobs, isLoading, isError, error, refetch } = useQuery({
    queryKey: COMPLETED_RENDER_JOBS_QUERY_KEY,
    queryFn: listCompletedRenderJobsAction,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Film className="h-4 w-4" />
          Pilih Video
        </CardTitle>
        <CardDescription>Video draft yang sudah selesai dirender di Render Engine.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : isError ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Gagal memuat daftar video</p>
              <p className="text-xs">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
              <button type="button" className="mt-1 text-xs underline" onClick={() => refetch()}>
                Coba lagi
              </button>
            </div>
          </div>
        ) : (jobs ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada video yang selesai dirender. Selesaikan render di Render Engine terlebih dahulu.</p>
        ) : (
          (jobs ?? []).map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelect(job.id)}
              className={`flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors ${
                selectedRenderJobId === job.id ? "border-primary bg-primary/5" : ""
              }`}
            >
              {job.output_public_url && <video src={job.output_public_url} className="h-16 w-16 shrink-0 rounded object-cover" muted preload="metadata" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{job.storyboard?.title ?? job.storyboard_id}</p>
                <p className="text-xs text-muted-foreground">{job.duration_seconds ? `${Math.round(job.duration_seconds)}s` : ""}</p>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
