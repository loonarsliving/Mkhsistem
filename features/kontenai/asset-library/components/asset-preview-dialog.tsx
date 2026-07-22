import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ASSET_TYPE_ICON, ASSET_TYPE_LABEL } from "@/features/kontenai/asset-library/utils/asset-type-meta";
import { formatBytes, formatDateTime, formatDuration } from "@/features/kontenai/asset-library/utils/format";
import type { KontenAiAssetWithCreator } from "@/repositories/kontenai-assets.repository";

interface AssetPreviewDialogProps {
  asset: KontenAiAssetWithCreator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssetPreviewDialog({ asset, open, onOpenChange }: AssetPreviewDialogProps) {
  if (!asset) return null;

  const Icon = ASSET_TYPE_ICON[asset.asset_type as keyof typeof ASSET_TYPE_ICON];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {asset.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[50vh] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
          {asset.asset_type === "image" || asset.asset_type === "logo" ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
            <img src={asset.public_url} alt={asset.title} className="max-h-[50vh] w-full object-contain" />
          ) : asset.asset_type === "video" ? (
            <video src={asset.public_url} controls className="max-h-[50vh] w-full" />
          ) : asset.asset_type === "audio" ? (
            <audio src={asset.public_url} controls className="w-full p-6" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Icon className="h-10 w-10" />
              <p className="text-sm">Pratinjau tidak tersedia untuk tipe ini -- unduh untuk membuka.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <InfoRow label="Tipe" value={<Badge variant="outline">{ASSET_TYPE_LABEL[asset.asset_type as keyof typeof ASSET_TYPE_LABEL]}</Badge>} />
          <InfoRow label="Status" value={<Badge variant="secondary">{asset.status}</Badge>} />
          <InfoRow label="Ukuran File" value={formatBytes(asset.file_size_bytes)} />
          <InfoRow label="Resolusi" value={asset.resolution ?? "-"} />
          <InfoRow label="Durasi" value={formatDuration(asset.duration_seconds) ?? "-"} />
          <InfoRow label="Tipe File" value={asset.file_type} />
          <InfoRow label="Company" value={asset.company ?? "-"} />
          <InfoRow label="Project" value={asset.project ?? "-"} />
          <InfoRow label="Campaign" value={asset.campaign ?? "-"} />
          <InfoRow label="Platform" value={asset.platform ?? "-"} />
          <InfoRow label="Content Type" value={asset.content_type ?? "-"} />
          <InfoRow label="Location" value={asset.location ?? "-"} />
          <InfoRow label="Creator" value={asset.creator?.full_name ?? "-"} />
          <InfoRow label="Dibuat" value={formatDateTime(asset.created_at)} />
          <InfoRow label="Diperbarui" value={formatDateTime(asset.updated_at)} />
          <InfoRow label="Storage Path" value={<span className="break-all text-xs">{asset.storage_path}</span>} />
        </div>

        {asset.description && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Deskripsi</p>
            <p className="text-sm">{asset.description}</p>
          </div>
        )}

        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {asset.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <Button asChild variant="outline" className="w-full">
          <a href={asset.public_url} download={asset.filename} target="_blank" rel="noreferrer">
            <Download className="h-4 w-4" />
            Download
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="font-medium">{value}</div>
    </div>
  );
}
