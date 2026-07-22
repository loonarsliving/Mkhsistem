"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssetCardMenu } from "@/features/kontenai/asset-library/components/asset-card-menu";
import { AssetThumbnail } from "@/features/kontenai/asset-library/components/asset-thumbnail";
import { ASSET_TYPE_LABEL } from "@/features/kontenai/asset-library/utils/asset-type-meta";
import { formatBytes, formatDate } from "@/features/kontenai/asset-library/utils/format";
import type { KontenAiAssetType, KontenAiAssetWithCreator } from "@/repositories/kontenai-assets.repository";

interface AssetListProps {
  assets: KontenAiAssetWithCreator[];
  onPreview: (asset: KontenAiAssetWithCreator) => void;
  onEdit: (asset: KontenAiAssetWithCreator) => void;
}

export function AssetList({ assets, onPreview, onEdit }: AssetListProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aset</TableHead>
            <TableHead>Tipe</TableHead>
            <TableHead>Company / Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ukuran</TableHead>
            <TableHead>Diperbarui</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id} className="cursor-pointer" onClick={() => onPreview(asset)}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted/40">
                    <AssetThumbnail assetType={asset.asset_type as KontenAiAssetType} publicUrl={asset.public_url} title={asset.title} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={asset.title}>
                      {asset.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={asset.filename}>
                      {asset.filename}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{ASSET_TYPE_LABEL[asset.asset_type as KontenAiAssetType]}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {[asset.company, asset.project].filter(Boolean).join(" / ") || "-"}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{asset.status}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatBytes(asset.file_size_bytes)}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(asset.updated_at)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end">
                  <AssetCardMenu asset={asset} onPreview={() => onPreview(asset)} onEdit={() => onEdit(asset)} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
