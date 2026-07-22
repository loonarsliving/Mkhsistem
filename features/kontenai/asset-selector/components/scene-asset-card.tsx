"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssetMatchThumb } from "@/features/kontenai/asset-selector/components/asset-match-thumb";
import type { KontenAiAnalyzedAsset } from "@/repositories/kontenai-assets.repository";
import type { KontenAiStoryboardScene } from "@/repositories/kontenai-storyboards.repository";

interface SceneAssetCardProps {
  scene: KontenAiStoryboardScene;
  index: number;
  assetById: Map<string, KontenAiAnalyzedAsset>;
  onOverride: (assetId: string) => void;
}

/** One scene's asset-matching result: the auto-selected asset plus up to 5 alternatives (Sprint 5 spec items 4-6), clickable to override. */
export function SceneAssetCard({ scene, index, assetById, onOverride }: SceneAssetCardProps) {
  const hasAsset = Boolean(scene.selectedAssetId);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">Scene {index + 1}</Badge>
          {scene.sceneTitle || "(tanpa judul)"}
        </CardTitle>
        {hasAsset ? (
          <Badge variant="outline" className="gap-1 text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Punya Aset
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-amber-600">
            <AlertCircle className="h-3.5 w-3.5" />
            Belum Ada Aset
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{scene.visualDescription}</p>

        {scene.assetMatches.length === 0 ? (
          <p className="text-xs text-muted-foreground">Belum ada kandidat aset -- jalankan Auto-Select Assets.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {scene.assetMatches.map((match) => {
              const asset = assetById.get(match.assetId);
              if (!asset) return null;
              return (
                <AssetMatchThumb
                  key={match.assetId}
                  asset={asset}
                  score={match.score}
                  selected={scene.selectedAssetId === match.assetId}
                  onSelect={() => onOverride(match.assetId)}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
