import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AssetVisionMetadata } from "@/features/kontenai/types";

interface VisionStatusBadgeProps {
  metadata: AssetVisionMetadata | null;
}

/** Reflects whether Sprint 2 (Gemini Vision) has analyzed this asset yet. */
export function VisionStatusBadge({ metadata }: VisionStatusBadgeProps) {
  if (metadata) {
    return (
      <Badge variant="success">
        <Sparkles className="mr-1 h-3 w-3" />
        Dianalisis
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <Sparkles className="mr-1 h-3 w-3 opacity-50" />
      Belum dianalisis
    </Badge>
  );
}
