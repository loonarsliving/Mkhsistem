"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clapperboard, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RenderJobHistory } from "@/features/kontenai/render-engine/components/render-job-history";
import { RenderProgressCard } from "@/features/kontenai/render-engine/components/render-progress-card";
import { useRunRenderJob } from "@/features/kontenai/render-engine/hooks/use-render-job-mutations";
import { getStoryboardAction } from "@/features/kontenai/storyboard-engine/actions/storyboard.actions";
import { StoryboardHistory } from "@/features/kontenai/storyboard-engine/components/storyboard-history";

function WorkspacePlaceholder() {
  return (
    <Card>
      <CardContent className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 py-10 text-center">
        <Clapperboard className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Pilih storyboard dari daftar di bawah untuk merendernya menjadi video draft.</p>
      </CardContent>
    </Card>
  );
}

/** Render Engine's workspace: pick a render-ready storyboard -> render to a draft mp4 with real progress -> preview/download -> history. */
export function RenderEngineWorkspace() {
  const [activeStoryboardId, setActiveStoryboardId] = React.useState<string | null>(null);
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null);

  const {
    data: storyboard,
    isLoading: isStoryboardLoading,
    isError: isStoryboardError,
    error: storyboardError,
  } = useQuery({
    queryKey: ["kontenai-storyboard", activeStoryboardId],
    queryFn: () => getStoryboardAction(activeStoryboardId!),
    enabled: Boolean(activeStoryboardId),
  });

  const runRenderMutation = useRunRenderJob();

  const scenes = storyboard?.scenes ?? [];
  const isRenderReady = scenes.length > 0 && scenes.every((scene) => scene.selectedAssetId);

  function handleRender() {
    if (!activeStoryboardId) return;
    runRenderMutation.mutate(activeStoryboardId, { onSuccess: (job) => setActiveJobId(job.id) });
  }

  return (
    <div className="space-y-6">
      {!activeStoryboardId ? (
        <WorkspacePlaceholder />
      ) : isStoryboardLoading ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : isStoryboardError || !storyboard ? (
        <Card>
          <CardContent className="flex items-start gap-2 py-6 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Gagal memuat storyboard</p>
              <p className="text-xs">{storyboardError instanceof Error ? storyboardError.message : "Terjadi kesalahan"}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-medium">{storyboard.title}</p>
                <p className="text-xs text-muted-foreground">
                  {scenes.length} scene -- {storyboard.total_duration_seconds}s
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isRenderReady && <Badge variant="outline" className="text-amber-600">Belum semua scene punya aset</Badge>}
                <Button type="button" size="sm" disabled={!isRenderReady || runRenderMutation.isPending} onClick={handleRender}>
                  <Wand2 className="h-4 w-4" />
                  {runRenderMutation.isPending ? "Memulai render..." : "Render Video Draft"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {!isRenderReady && (
            <p className="text-sm text-muted-foreground">
              Lengkapi pemilihan aset untuk setiap scene di{" "}
              <a href="/kontenai/asset-selector" className="underline">
                Asset Selector
              </a>{" "}
              sebelum merender.
            </p>
          )}
        </div>
      )}

      {activeJobId && <RenderProgressCard jobId={activeJobId} retryDisabled={runRenderMutation.isPending || !activeStoryboardId} onRetry={handleRender} />}

      <StoryboardHistory activeStoryboardId={activeStoryboardId} onSelect={setActiveStoryboardId} />
      <RenderJobHistory
        activeJobId={activeJobId}
        onSelect={(job) => {
          setActiveJobId(job.id);
          setActiveStoryboardId(job.storyboard_id);
        }}
      />
    </div>
  );
}
