"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AssetCardMenu } from "@/features/kontenai/asset-library/components/asset-card-menu";
import { AssetThumbnail } from "@/features/kontenai/asset-library/components/asset-thumbnail";
import { AssetVisionStatusBadge } from "@/features/kontenai/asset-library/components/asset-vision-status-badge";
import { ASSET_TYPE_LABEL } from "@/features/kontenai/asset-library/utils/asset-type-meta";
import { formatBytes } from "@/features/kontenai/asset-library/utils/format";
import type { KontenAiAssetType, KontenAiAssetWithCreator } from "@/repositories/kontenai-assets.repository";

interface AssetGridProps {
  assets: KontenAiAssetWithCreator[];
  onPreview: (asset: KontenAiAssetWithCreator) => void;
  onEdit: (asset: KontenAiAssetWithCreator) => void;
}

export function AssetGrid({ assets, onPreview, onEdit }: AssetGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {assets.map((asset) => (
        <Card key={asset.id} className="group cursor-pointer overflow-hidden transition-colors hover:border-primary/40" onClick={() => onPreview(asset)}>
          <div className="aspect-square overflow-hidden bg-muted/40">
            <AssetThumbnail assetType={asset.asset_type as KontenAiAssetType} publicUrl={asset.public_url} title={asset.title} />
          </div>
          <CardContent className="space-y-1.5 p-3">
            <div className="flex items-start justify-between gap-1">
              <p className="line-clamp-1 text-sm font-medium">{asset.title}</p>
              <AssetCardMenu asset={asset} onPreview={() => onPreview(asset)} onEdit={() => onEdit(asset)} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[11px]">
                {ASSET_TYPE_LABEL[asset.asset_type as KontenAiAssetType]}
              </Badge>
              <AssetVisionStatusBadge assetType={asset.asset_type as KontenAiAssetType} status={asset.ai_vision_status} />
              <span className="text-xs text-muted-foreground">{formatBytes(asset.file_size_bytes)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
