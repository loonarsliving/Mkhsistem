"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listPublishSchedulesAction } from "@/features/kontenai/publishing-engine/actions/publishing.actions";
import { usePublishNow, PUBLISH_SCHEDULES_QUERY_KEY } from "@/features/kontenai/publishing-engine/hooks/use-publishing-mutations";
import { platformLabel, STATUS_LABELS } from "@/features/kontenai/publishing-engine/types";

function formatSchedule(iso: string | null): string {
  if (!iso) return "Belum dijadwalkan";
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Buat halaman Content Calendar" + status display (Draft/Scheduled/Published/Failed) -- every publish schedule ever created, ordered by publish date. */
export function ContentCalendarList() {
  const {
    data: schedules,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: PUBLISH_SCHEDULES_QUERY_KEY, queryFn: listPublishSchedulesAction });

  const publishMutation = usePublishNow();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 py-6 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Gagal memuat Content Calendar</p>
            <p className="text-xs">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
            <button type="button" className="mt-1 text-xs underline" onClick={() => refetch()}>
              Coba lagi
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const list = schedules ?? [];

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada jadwal publish</p>
          <p className="max-w-sm text-sm text-muted-foreground">Buat jadwal di halaman Publishing Engine terlebih dahulu.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((schedule) => {
        const status = STATUS_LABELS[schedule.status] ?? STATUS_LABELS.draft;
        const canPublish = schedule.status === "draft" || schedule.status === "scheduled" || schedule.status === "failed";

        return (
          <Card key={schedule.id}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{platformLabel(schedule.platform)}</Badge>
                {schedule.renderJob?.storyboard?.title ?? "Video"}
              </CardTitle>
              <Badge variant="outline" className={status.className}>
                {status.label}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground line-clamp-2">{schedule.caption}</p>
              {schedule.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {schedule.hashtags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {schedule.status === "published" ? `Dipublikasikan ${formatSchedule(schedule.published_at)}` : formatSchedule(schedule.scheduled_at)}
                </p>
                {canPublish && (
                  <Button type="button" size="sm" variant="outline" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(schedule.id)}>
                    <Send className="h-3.5 w-3.5" />
                    Publish Sekarang
                  </Button>
                )}
              </div>
              {schedule.status === "failed" && schedule.error_message && <p className="text-xs text-destructive">{schedule.error_message}</p>}
              {schedule.status === "published" && schedule.external_post_url && (
                <a href={schedule.external_post_url} target="_blank" rel="noreferrer" className="text-xs underline">
                  Lihat post
                </a>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
