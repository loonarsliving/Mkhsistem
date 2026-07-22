"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listCreativeBriefsAction } from "@/features/kontenai/ai-director/actions/creative-brief.actions";
import { CreativeBriefResult } from "@/features/kontenai/ai-director/components/creative-brief-result";
import { CREATIVE_BRIEFS_QUERY_KEY } from "@/features/kontenai/ai-director/hooks/use-creative-brief-mutations";
import { objectiveLabel, platformLabel } from "@/features/kontenai/ai-director/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Riwayat Creative Brief -- every brief ever generated, newest first, expandable to the full six-field breakdown. */
export function CreativeBriefHistory() {
  const { data: briefs, isLoading, isError, error, refetch } = useQuery({
    queryKey: CREATIVE_BRIEFS_QUERY_KEY,
    queryFn: listCreativeBriefsAction,
  });

  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />
            Riwayat Creative Brief
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
            Riwayat Creative Brief
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

  const list = briefs ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Riwayat Creative Brief ({list.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada Creative Brief yang dibuat.</p>
        ) : (
          list.map((brief) => (
            <div key={brief.id} className="rounded-md border">
              <button
                type="button"
                onClick={() => setExpandedId((current) => (current === brief.id ? null : brief.id))}
                className="flex w-full items-start justify-between gap-3 p-3 text-left"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{brief.product_project}</p>
                  <p className="text-xs text-muted-foreground">{brief.big_idea}</p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Badge variant="secondary">{objectiveLabel(brief.objective)}</Badge>
                    <Badge variant="outline">{platformLabel(brief.platform)}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(brief.created_at)}</span>
                    {brief.creator?.full_name && <span className="text-xs text-muted-foreground">-- {brief.creator.full_name}</span>}
                  </div>
                </div>
              </button>
              {expandedId === brief.id && (
                <div className="border-t p-3">
                  <CreativeBriefResult brief={brief} />
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
