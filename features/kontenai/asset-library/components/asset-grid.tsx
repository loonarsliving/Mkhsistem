import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import type { AssetRecord } from "@/features/kontenai/types";
import { AssetDeleteButton } from "./asset-delete-button";
import { AssetTagEditor } from "./asset-tag-editor";
import { AssetThumbnail } from "./asset-thumbnail";
import { formatBytes, formatDuration, formatUploadedAt } from "./asset-format";
import { ASSET_TYPE_LABEL } from "./asset-type-icon";
import { VisionStatusBadge } from "./vision-status-badge";

interface AssetGridProps {
  assets: AssetRecord[];
  onUpdateTags: (assetId: string, tags: string[]) => Promise<boolean>;
  onDelete: (assetId: string) => void;
  mutatingAssetId: string | null;
}

export function AssetGrid({ assets, onUpdateTags, onDelete, mutatingAssetId }: AssetGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {assets.map((asset) => {
        const duration = formatDuration(asset.durationSeconds);
        const isMutating = mutatingAssetId === asset.id;
        return (
          <Card key={asset.id} className="flex flex-col overflow-hidden">
            <CardHeader className="p-0">
              <AssetThumbnail type={asset.type} className="h-32 w-full rounded-none" iconClassName="h-10 w-10" />
            </CardHeader>
            <CardContent className="flex-1 space-y-2 pt-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium" title={asset.filename}>
                  {asset.filename}
                </p>
                <div className="flex shrink-0 items-center gap-0.5">
                  <AssetTagEditor asset={asset} onSave={onUpdateTags} isSubmitting={isMutating} />
                  <AssetDeleteButton asset={asset} onConfirm={onDelete} isSubmitting={isMutating} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{ASSET_TYPE_LABEL[asset.type]}</Badge>
                <VisionStatusBadge metadata={asset.metadata} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatBytes(asset.sizeBytes)}</span>
                {duration && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {duration}
                  </span>
                )}
              </div>
              {asset.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {asset.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="pt-0 text-xs text-muted-foreground">
              Diunggah {formatUploadedAt(asset.uploadedAt)} oleh {asset.uploadedBy}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
