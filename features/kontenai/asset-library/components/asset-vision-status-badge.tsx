import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { isVisionEligibleAssetType } from "@/features/kontenai/asset-library/utils/vision-eligibility";
import type { KontenAiAssetType, KontenAiAssetVisionStatus } from "@/repositories/kontenai-assets.repository";

interface AssetVisionStatusBadgeProps {
  assetType: KontenAiAssetType;
  status: KontenAiAssetVisionStatus;
}

/** Small at-a-glance indicator for grid/list rows -- renders nothing for asset types Gemini Vision doesn't support, or once analyzed successfully (no badge needed then, the detail panel is the source of truth). */
export function AssetVisionStatusBadge({ assetType, status }: AssetVisionStatusBadgeProps) {
  if (!isVisionEligibleAssetType(assetType)) return null;

  if (status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 text-[11px]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Menganalisis
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1 text-[11px]">
        <AlertTriangle className="h-3 w-3" />
        Analisis gagal
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge variant="secondary" className="gap-1 text-[11px]">
        <Sparkles className="h-3 w-3" />
        AI Vision
      </Badge>
    );
  }
  return null;
}
