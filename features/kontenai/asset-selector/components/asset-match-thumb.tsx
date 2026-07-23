"use client";

import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AssetThumbnail } from "@/features/kontenai/asset-library/components/asset-thumbnail";
import type { KontenAiAnalyzedAsset } from "@/repositories/kontenai-assets.repository";
import { cn } from "@/lib/utils";

interface AssetMatchThumbProps {
  asset: KontenAiAnalyzedAsset;
  score: number;
  selected: boolean;
  onSelect: () => void;
}

/** One clickable candidate in a scene's alternative list -- shows the asset, its match score, and whether it's the currently selected one. */
export function AssetMatchThumb({ asset, score, selected, onSelect }: AssetMatchThumbProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative aspect-square w-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
        selected ? "border-primary" : "border-transparent hover:border-muted-foreground/40",
      )}
      title={asset.aiTitle ?? asset.title}
    >
      <AssetThumbnail assetType={asset.assetType} publicUrl={asset.publicUrl} title={asset.aiTitle ?? asset.title} />
      {selected && (
        <div className="absolute right-1 top-1 rounded-full bg-primary p-0.5">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      <Badge variant="secondary" className="absolute bottom-1 left-1 px-1 py-0 text-[10px] leading-4">
        {score}%
      </Badge>
    </button>
  );
}
