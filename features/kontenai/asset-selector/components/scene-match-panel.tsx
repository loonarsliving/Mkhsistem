"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AssetRecord, AssetSelection, StoryboardScene } from "@/features/kontenai/types";
import { AssetOverrideDialog } from "@/features/kontenai/asset-selector/components/asset-override-dialog";
import { AssetThumbnail } from "@/features/kontenai/asset-selector/components/asset-thumbnail";
import { MatchScoreBar } from "@/features/kontenai/asset-selector/components/match-score-badge";

interface SceneMatchPanelProps {
  scene: StoryboardScene;
  selection: AssetSelection;
  asset: AssetRecord | null;
  assetLibrary: AssetRecord[];
  overridden: boolean;
  onOverride: (assetId: string) => void;
}

export function SceneMatchPanel({ scene, selection, asset, assetLibrary, overridden, onOverride }: SceneMatchPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Scene {scene.order}</Badge>
            <span className="text-xs text-muted-foreground">{scene.durationSeconds}s &middot; {scene.transition}</span>
          </div>
          <p className="text-sm font-medium">{scene.description}</p>
          {scene.textOverlay && <p className="text-xs italic text-muted-foreground">&ldquo;{scene.textOverlay}&rdquo;</p>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {scene.requiredAssetTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <div className="flex items-start gap-3">
            <AssetThumbnail type={asset?.type ?? "image"} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{asset?.filename ?? "Belum ada aset terpilih"}</p>
                {asset && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {asset.type}
                  </Badge>
                )}
                {overridden && (
                  <Badge variant="warning" className="text-[10px]">
                    Manual override
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{selection.rationale}</p>
            </div>
          </div>

          <MatchScoreBar score={selection.matchScore} />

          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Ganti Aset
          </Button>
        </div>
      </CardContent>

      <AssetOverrideDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sceneDescription={scene.description}
        requiredAssetTags={scene.requiredAssetTags}
        assetLibrary={assetLibrary}
        currentAssetId={selection.assetId}
        onConfirm={onOverride}
      />
    </Card>
  );
}
