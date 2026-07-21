"use client";

import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssetRecord, AssetVisionMetadata } from "@/features/kontenai/types";

function qualityTone(score: number): "success" | "warning" | "destructive" {
  if (score >= 7.5) return "success";
  if (score >= 5) return "warning";
  return "destructive";
}

export function AssetMetadataDialog({
  asset,
  metadata,
  open,
  onOpenChange,
}: {
  asset: AssetRecord | null;
  metadata: AssetVisionMetadata | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Hasil Gemini Vision
          </DialogTitle>
          <DialogDescription>{asset?.filename}</DialogDescription>
        </DialogHeader>

        {metadata ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground">Deskripsi</p>
              <p className="mt-1 text-sm text-muted-foreground">{metadata.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Skor kualitas</p>
              <Badge variant={qualityTone(metadata.qualityScore)}>{metadata.qualityScore.toFixed(1)} / 10</Badge>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Objek terdeteksi</p>
              <div className="flex flex-wrap gap-1.5">
                {metadata.detectedObjects.map((object) => (
                  <Badge key={object} variant="secondary">
                    {object}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Warna dominan</p>
              <div className="flex flex-wrap gap-2">
                {metadata.dominantColors.map((color) => (
                  <div key={color} className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-2.5 text-xs">
                    <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color }} />
                    <span className="text-muted-foreground">{color}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Rekomendasi penggunaan</p>
              <div className="flex flex-wrap gap-1.5">
                {metadata.suggestedUseCases.map((useCase) => (
                  <Badge key={useCase} variant="outline">
                    {useCase}
                  </Badge>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Dianalisis pada {new Date(metadata.analyzedAt).toLocaleString("id-ID")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada hasil analisis untuk aset ini.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
