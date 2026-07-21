import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { OptimizationArea, OptimizationRecommendation } from "@/features/kontenai/types";

const AREA_LABEL: Record<OptimizationArea, string> = {
  ai_director: "AI Director",
  storyboard: "Storyboard",
  asset_selection: "Asset Selection",
  render: "Render",
};

const STATUS_BADGE: Record<OptimizationRecommendation["status"], { label: string; variant: "outline" | "success" | "secondary" }> = {
  proposed: { label: "Diusulkan", variant: "outline" },
  applied: { label: "Diterapkan", variant: "success" },
  dismissed: { label: "Ditolak", variant: "secondary" },
};

function confidenceTone(confidence: number): "success" | "warning" | "destructive" {
  if (confidence >= 0.7) return "success";
  if (confidence >= 0.45) return "warning";
  return "destructive";
}

interface RecommendationCardProps {
  recommendation: OptimizationRecommendation;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
  isMutating: boolean;
}

export function RecommendationCard({ recommendation, onApply, onDismiss, isMutating }: RecommendationCardProps) {
  const status = STATUS_BADGE[recommendation.status];
  const confidencePercent = Math.round(recommendation.confidence * 100);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <Badge variant="outline">{AREA_LABEL[recommendation.area]}</Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Rekomendasi</p>
          <p className="text-sm">{recommendation.recommendation}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Dampak yang Diharapkan</p>
          <p className="text-sm text-muted-foreground">{recommendation.expectedImpact}</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Tingkat Keyakinan</span>
            <span className="font-semibold tabular-nums">{confidencePercent}%</span>
          </div>
          <Progress value={confidencePercent} tone={confidenceTone(recommendation.confidence)} />
        </div>
        {recommendation.basedOnRunIds.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Berdasarkan {recommendation.basedOnRunIds.length} pipeline run: {recommendation.basedOnRunIds.join(", ")}
          </p>
        )}
        {recommendation.status === "proposed" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => onApply(recommendation.id)} disabled={isMutating}>
              <Check className="h-4 w-4" />
              Terapkan
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDismiss(recommendation.id)} disabled={isMutating}>
              <X className="h-4 w-4" />
              Tolak
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
