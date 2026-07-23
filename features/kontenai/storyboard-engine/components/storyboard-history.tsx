"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STORYBOARDS_QUERY_KEY } from "@/features/kontenai/storyboard-engine/hooks/use-storyboard-mutations";
import { listStoryboardsAction } from "@/features/kontenai/storyboard-engine/actions/storyboard.actions";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface StoryboardHistoryProps {
  activeStoryboardId: string | null;
  onSelect: (storyboardId: string) => void;
}

/** "Tampilkan daftar storyboard yang pernah dibuat" -- every storyboard ever generated, newest first, clickable to load into the builder above. */
export function StoryboardHistory({ activeStoryboardId, onSelect }: StoryboardHistoryProps) {
  const { data: storyboards, isLoading, isError, error, refetch } = useQuery({
    queryKey: STORYBOARDS_QUERY_KEY,
    queryFn: listStoryboardsAction,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />
            Riwayat Storyboard
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
            Riwayat Storyboard
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

  const list = storyboards ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Riwayat Storyboard ({list.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada storyboard yang dibuat.</p>
        ) : (
          list.map((storyboard) => (
            <button
              key={storyboard.id}
              type="button"
              onClick={() => onSelect(storyboard.id)}
              className={`flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors ${
                activeStoryboardId === storyboard.id ? "border-primary bg-primary/5" : ""
              }`}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{storyboard.title}</p>
                {storyboard.creativeBrief && <p className="text-xs text-muted-foreground">{storyboard.creativeBrief.big_idea}</p>}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Badge variant="secondary">{storyboard.scenes.length} scene</Badge>
                  <Badge variant="outline">{storyboard.total_duration_seconds}s</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(storyboard.created_at)}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
