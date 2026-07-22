"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Compass } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BriefPicker } from "@/features/kontenai/storyboard-engine/components/brief-picker";
import { StoryboardBuilder } from "@/features/kontenai/storyboard-engine/components/storyboard-builder";
import { StoryboardHistory } from "@/features/kontenai/storyboard-engine/components/storyboard-history";
import { getStoryboardAction } from "@/features/kontenai/storyboard-engine/actions/storyboard.actions";

function BuilderPlaceholder() {
  return (
    <Card>
      <CardContent className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 py-10 text-center">
        <Compass className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Pilih Creative Brief lalu klik &quot;Generate Storyboard&quot;, atau pilih storyboard dari riwayat di bawah.
        </p>
      </CardContent>
    </Card>
  );
}

/** Storyboard Engine's workspace: pick a brief -> generate -> edit scenes -> preview -> save, with full history below. */
export function StoryboardWorkspace() {
  const [selectedBriefId, setSelectedBriefId] = React.useState<string | null>(null);
  const [activeStoryboardId, setActiveStoryboardId] = React.useState<string | null>(null);

  const {
    data: storyboard,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["kontenai-storyboard", activeStoryboardId],
    queryFn: () => getStoryboardAction(activeStoryboardId!),
    enabled: Boolean(activeStoryboardId),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <BriefPicker selectedBriefId={selectedBriefId} onSelectBrief={setSelectedBriefId} onGenerated={setActiveStoryboardId} />

        <div>
          {!activeStoryboardId ? (
            <BuilderPlaceholder />
          ) : isLoading ? (
            <Card>
              <CardContent className="space-y-3 py-6">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ) : isError || !storyboard ? (
            <Card>
              <CardContent className="flex items-start gap-2 py-6 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Gagal memuat storyboard</p>
                  <p className="text-xs">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <StoryboardBuilder key={storyboard.id} storyboardId={storyboard.id} title={storyboard.title} initialScenes={storyboard.scenes} />
          )}
        </div>
      </div>

      <StoryboardHistory activeStoryboardId={activeStoryboardId} onSelect={setActiveStoryboardId} />
    </div>
  );
}
