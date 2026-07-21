"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssetSelection } from "@/features/kontenai/types";
import {
  listAssetLibraryAction,
  listStoryboardsAction,
  selectAssetsForStoryboardAction,
} from "@/features/kontenai/asset-selector/actions/asset-selector.actions";
import { MatchScoreBar } from "@/features/kontenai/asset-selector/components/match-score-badge";
import { SceneMatchPanel } from "@/features/kontenai/asset-selector/components/scene-match-panel";
import { StoryboardList } from "@/features/kontenai/asset-selector/components/storyboard-list";

/** Per-storyboard selections, keyed by storyboard id then by scene id. */
type SelectionsByStoryboard = Record<string, Record<string, AssetSelection>>;

export function AssetSelectorWorkspace() {
  const queryClient = useQueryClient();
  const [activeStoryboardId, setActiveStoryboardId] = useState<string | null>(null);
  const [selections, setSelections] = useState<SelectionsByStoryboard>({});
  const [overriddenScenes, setOverriddenScenes] = useState<Record<string, true>>({});

  const storyboardsQuery = useQuery({ queryKey: ["kontenai-asset-selector-storyboards"], queryFn: listStoryboardsAction });
  const assetLibraryQuery = useQuery({ queryKey: ["kontenai-asset-selector-library"], queryFn: listAssetLibraryAction });

  const runSelectionMutation = useMutation({
    mutationFn: (storyboardId: string) => selectAssetsForStoryboardAction(storyboardId),
    onSuccess: (result, storyboardId) => {
      setSelections((prev) => ({
        ...prev,
        [storyboardId]: Object.fromEntries(result.map((s) => [s.sceneId, s])),
      }));
      setActiveStoryboardId(storyboardId);
      queryClient.setQueryData(["kontenai-asset-selector-selection", storyboardId], result);
    },
  });

  const storyboards = storyboardsQuery.data ?? [];
  const assetLibrary = useMemo(() => assetLibraryQuery.data ?? [], [assetLibraryQuery.data]);
  const assetById = useMemo(() => new Map(assetLibrary.map((a) => [a.id, a])), [assetLibrary]);

  const activeStoryboard = storyboards.find((sb) => sb.id === activeStoryboardId) ?? null;
  const activeSelections = activeStoryboardId ? selections[activeStoryboardId] : undefined;

  const averageScore = useMemo(() => {
    if (!activeSelections) return null;
    const values = Object.values(activeSelections);
    if (values.length === 0) return null;
    return values.reduce((sum, s) => sum + s.matchScore, 0) / values.length;
  }, [activeSelections]);

  function handleOverride(storyboardId: string, sceneId: string, assetId: string) {
    setSelections((prev) => {
      const current = prev[storyboardId]?.[sceneId];
      if (!current) return prev;
      return {
        ...prev,
        [storyboardId]: {
          ...prev[storyboardId],
          [sceneId]: { ...current, assetId, matchScore: current.matchScore, rationale: "Aset dipilih manual oleh pengguna, menggantikan hasil auto-select." },
        },
      };
    });
    setOverriddenScenes((prev) => ({ ...prev, [`${storyboardId}:${sceneId}`]: true }));
  }

  const isLoading = storyboardsQuery.isLoading || assetLibraryQuery.isLoading;

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (storyboards.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada storyboard dari Storyboard Engine untuk dipilihkan asetnya.</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Storyboard</p>
        <StoryboardList
          storyboards={storyboards}
          activeStoryboardId={activeStoryboardId}
          runningStoryboardId={runSelectionMutation.isPending ? runSelectionMutation.variables ?? null : null}
          hasResults={(id) => Boolean(selections[id])}
          onSelect={(id) => setActiveStoryboardId(id)}
          onRunSelection={(id) => runSelectionMutation.mutate(id)}
        />
      </div>

      <div className="space-y-4">
        {!activeStoryboard && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <Sparkles className="h-8 w-8 text-muted-foreground/60" />
              Pilih storyboard di sebelah kiri, lalu jalankan &ldquo;Auto-Select Assets&rdquo; untuk melihat hasil pencocokan per scene.
            </CardContent>
          </Card>
        )}

        {activeStoryboard && !activeSelections && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
              Belum ada hasil untuk storyboard ini. Klik &ldquo;Auto-Select Assets&rdquo; untuk menjalankan pencocokan.
            </CardContent>
          </Card>
        )}

        {activeStoryboard && activeSelections && (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Ringkasan Storyboard {activeStoryboard.id}</CardTitle>
                {averageScore !== null && (
                  <Badge variant="outline">{Math.round(averageScore * 100)}% rata-rata match</Badge>
                )}
              </CardHeader>
              <CardContent>
                {averageScore !== null && <MatchScoreBar score={averageScore} />}
              </CardContent>
            </Card>

            <div className="space-y-3">
              {activeStoryboard.scenes.map((scene) => {
                const selection = activeSelections[scene.id];
                if (!selection) return null;
                const asset = assetById.get(selection.assetId) ?? null;
                const overridden = Boolean(overriddenScenes[`${activeStoryboard.id}:${scene.id}`]);

                return (
                  <SceneMatchPanel
                    key={scene.id}
                    scene={scene}
                    selection={selection}
                    asset={asset}
                    assetLibrary={assetLibrary}
                    overridden={overridden}
                    onOverride={(assetId) => handleOverride(activeStoryboard.id, scene.id, assetId)}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
