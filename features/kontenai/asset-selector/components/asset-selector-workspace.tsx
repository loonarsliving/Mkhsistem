"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listAnalyzedAssetLibraryAction } from "@/features/kontenai/asset-selector/actions/select-assets.actions";
import { SceneAssetCard } from "@/features/kontenai/asset-selector/components/scene-asset-card";
import { useOverrideSceneAsset, useRunAssetSelection } from "@/features/kontenai/asset-selector/hooks/use-asset-selector-mutations";
import { getStoryboardAction } from "@/features/kontenai/storyboard-engine/actions/storyboard.actions";
import { StoryboardHistory } from "@/features/kontenai/storyboard-engine/components/storyboard-history";

function WorkspacePlaceholder() {
  return (
    <Card>
      <CardContent className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 py-10 text-center">
        <Boxes className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Pilih storyboard dari daftar di bawah, lalu klik &quot;Auto-Select Assets&quot;.</p>
      </CardContent>
    </Card>
  );
}

/** Asset Selector's workspace: pick a storyboard -> auto-select assets per scene -> review/override alternatives -> completion status. */
export function AssetSelectorWorkspace() {
  const [activeStoryboardId, setActiveStoryboardId] = React.useState<string | null>(null);

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

  const {
    data: assetLibrary,
    isLoading: isLibraryLoading,
    isError: isLibraryError,
  } = useQuery({
    queryKey: ["kontenai-analyzed-asset-library"],
    queryFn: listAnalyzedAssetLibraryAction,
  });

  const assetById = React.useMemo(() => new Map((assetLibrary ?? []).map((asset) => [asset.id, asset])), [assetLibrary]);

  const runSelectionMutation = useRunAssetSelection();
  const overrideMutation = useOverrideSceneAsset();

  const scenes = storyboard?.scenes ?? [];
  const completedCount = scenes.filter((scene) => scene.selectedAssetId).length;
  const allComplete = scenes.length > 0 && completedCount === scenes.length;

  return (
    <div className="space-y-6">
      <div>
        {!activeStoryboardId ? (
          <WorkspacePlaceholder />
        ) : isStoryboardLoading ? (
          <Card>
            <CardContent className="space-y-3 py-6">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-24 w-full" />
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
                  {scenes.length > 0 && (
                    <Badge variant={allComplete ? "default" : "outline"} className={allComplete ? "" : "text-amber-600"}>
                      {allComplete ? "Semua scene sudah punya aset" : `${completedCount}/${scenes.length} scene sudah punya aset`}
                    </Badge>
                  )}
                  <Button type="button" size="sm" disabled={runSelectionMutation.isPending || isLibraryLoading} onClick={() => runSelectionMutation.mutate(storyboard.id)}>
                    <Wand2 className="h-4 w-4" />
                    {runSelectionMutation.isPending ? "Memilih aset..." : "Auto-Select Assets"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {isLibraryError && (
              <p className="text-sm text-destructive">Gagal memuat Asset Library -- Auto-Select Assets mungkin tidak menemukan kandidat.</p>
            )}

            {scenes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Storyboard ini belum memiliki scene.</p>
            ) : (
              <div className="space-y-3">
                {scenes.map((scene, index) => (
                  <SceneAssetCard
                    key={scene.id}
                    scene={scene}
                    index={index}
                    assetById={assetById}
                    onOverride={(assetId) => overrideMutation.mutate({ storyboardId: storyboard.id, sceneId: scene.id, assetId })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <StoryboardHistory activeStoryboardId={activeStoryboardId} onSelect={setActiveStoryboardId} />
    </div>
  );
}
