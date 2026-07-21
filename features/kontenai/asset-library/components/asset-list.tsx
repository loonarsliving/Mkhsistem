import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AssetRecord } from "@/features/kontenai/types";

import { AssetThumbnail } from "./asset-thumbnail";
import { formatBytes, formatDuration, formatUploadedAt } from "./asset-format";
import { ASSET_TYPE_LABEL } from "./asset-type-icon";
import { VisionStatusBadge } from "./vision-status-badge";

interface AssetListProps {
  assets: AssetRecord[];
}

export function AssetList({ assets }: AssetListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Aset</TableHead>
          <TableHead>Tipe</TableHead>
          <TableHead>Ukuran</TableHead>
          <TableHead>Tag</TableHead>
          <TableHead>Gemini Vision</TableHead>
          <TableHead>Diunggah</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((asset) => {
          const duration = formatDuration(asset.durationSeconds);
          return (
            <TableRow key={asset.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <AssetThumbnail type={asset.type} className="h-10 w-10 shrink-0" iconClassName="h-5 w-5" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={asset.filename}>
                      {asset.filename}
                    </p>
                    {duration && <p className="text-xs text-muted-foreground">{duration}</p>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{ASSET_TYPE_LABEL[asset.type]}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatBytes(asset.sizeBytes)}</TableCell>
              <TableCell>
                <div className="flex max-w-56 flex-wrap gap-1">
                  {asset.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <VisionStatusBadge metadata={asset.metadata} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatUploadedAt(asset.uploadedAt)}
                <br />
                {asset.uploadedBy}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
