"use client";

import { AlertTriangle, Clock, Palette, RefreshCw, Sparkles, Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyzeAssetVision } from "@/features/kontenai/asset-library/hooks/use-kontenai-asset-mutations";
import { isVisionEligibleAssetType } from "@/features/kontenai/asset-library/utils/vision-eligibility";
import type { KontenAiAssetType, KontenAiAssetWithCreator } from "@/repositories/kontenai-assets.repository";

interface AssetVisionPanelProps {
  asset: KontenAiAssetWithCreator;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Gemini Vision metadata section of the asset detail view (AssetPreviewDialog) -- loading/success/error states plus the "Analyze Again" retry button (Sprint 2). Not rendered at all for asset types Gemini Vision doesn't support (audio/logo/brand_guideline/font/template/document). */
export function AssetVisionPanel({ asset }: AssetVisionPanelProps) {
  const analyzeMutation = useAnalyzeAssetVision();

  if (!isVisionEligibleAssetType(asset.asset_type as KontenAiAssetType)) return null;

  const isPending = asset.ai_vision_status === "pending" || analyzeMutation.isPending;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          Gemini Vision
        </CardTitle>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => analyzeMutation.mutate(asset.id)}>
          <RefreshCw className={isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {asset.ai_vision_status === "not_analyzed" ? "Analyze" : "Analyze Again"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : asset.ai_vision_status === "failed" ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Analisis gagal</p>
              <p className="text-xs">{asset.ai_error ?? "Terjadi kesalahan saat menganalisis aset ini."}</p>
            </div>
          </div>
        ) : asset.ai_vision_status === "not_analyzed" ? (
          <p className="text-sm text-muted-foreground">Aset ini belum dianalisis oleh Gemini Vision. Klik &quot;Analyze&quot; untuk memulai.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {asset.ai_title && (
              <div>
                <p className="text-xs text-muted-foreground">Judul (AI)</p>
                <p className="font-medium">{asset.ai_title}</p>
              </div>
            )}
            {asset.ai_description && (
              <div>
                <p className="text-xs text-muted-foreground">Deskripsi (AI)</p>
                <p>{asset.ai_description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {asset.ai_category && (
                <div>
                  <p className="text-xs text-muted-foreground">Kategori</p>
                  <Badge variant="secondary">{asset.ai_category}</Badge>
                </div>
              )}
              {asset.ai_mood && (
                <div>
                  <p className="text-xs text-muted-foreground">Mood Visual</p>
                  <Badge variant="outline">{asset.ai_mood}</Badge>
                </div>
              )}
            </div>
            {asset.ai_tags.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Tags className="h-3 w-3" /> Tags (AI)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {asset.ai_tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {asset.ai_detected_objects.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Objek Terdeteksi</p>
                <div className="flex flex-wrap gap-1.5">
                  {asset.ai_detected_objects.map((object) => (
                    <Badge key={object} variant="secondary">
                      {object}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {asset.ai_dominant_colors.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Palette className="h-3 w-3" /> Warna Dominan
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {asset.ai_dominant_colors.map((color) => (
                    <Badge key={color} variant="outline">
                      {color}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {asset.asset_type === "video" && asset.ai_scene_summary.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Scene Summary
                </p>
                <ol className="space-y-2 border-l pl-3">
                  {asset.ai_scene_summary.map((scene, index) => (
                    <li key={`${scene.timestampSeconds}-${index}`} className="flex gap-2">
                      <Badge variant="outline" className="h-fit shrink-0 font-mono text-xs">
                        {formatTimestamp(scene.timestampSeconds)}
                      </Badge>
                      <p className="text-sm">{scene.description}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
