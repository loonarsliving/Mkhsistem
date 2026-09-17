"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Loader2, PauseCircle, PlayCircle, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { applyCampaignRecommendationAction, listCampaignRecommendationsAction, requestCampaignDecisionAction } from "../actions/occupancy-ads.actions";

const DECISION_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" }> = {
  scale: { label: "SCALE", variant: "success" },
  maintain: { label: "MAINTAIN", variant: "secondary" },
  reduce: { label: "REDUCE", variant: "destructive" },
  pause: { label: "PAUSE", variant: "destructive" },
};

/**
 * Campaign Decision Engine panel (spec §36) -- a human-triggered button
 * that calls requestCampaignDecisionAction (lib/occupancy/decision-engine.ts
 * behind it, RECOMMENDS only), shows the stored recommendation + its
 * plain-language reasoning, and lets a human "apply" it. Applying a PAUSE
 * recommendation only changes this module's own local status -- it never
 * calls the Meta API to push a live budget/status change (ASSISTED mode).
 */
export function CampaignDecisionPanel({ campaignId, campaignStatus }: { campaignId: string; campaignStatus: string }) {
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = React.useState(false);
  const [applyingId, setApplyingId] = React.useState<string | null>(null);

  const { data: recommendations } = useQuery({
    queryKey: ["occupancy-campaign-recommendations", campaignId],
    queryFn: () => listCampaignRecommendationsAction(campaignId),
  });
  const latest = recommendations?.[0] ?? null;

  if (campaignStatus !== "active" && campaignStatus !== "paused") return null;

  async function handleRequest() {
    setRequesting(true);
    const result = await requestCampaignDecisionAction(campaignId);
    setRequesting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["occupancy-campaign-recommendations", campaignId] });
  }

  async function handleApply(recommendationId: string, decision: "scale" | "maintain" | "reduce" | "pause") {
    setApplyingId(recommendationId);
    const result = await applyCampaignRecommendationAction(recommendationId, campaignId, decision);
    setApplyingId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(decision === "pause" ? "Campaign dijeda sesuai rekomendasi" : "Rekomendasi ditandai diterapkan");
    queryClient.invalidateQueries({ queryKey: ["occupancy-campaign-recommendations", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["occupancy-campaigns"] });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />
          Campaign Decision Engine
        </p>
        <Button size="sm" variant="outline" disabled={requesting} onClick={handleRequest}>
          {requesting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
          Minta Rekomendasi
        </Button>
      </div>

      {latest && (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={DECISION_LABEL[latest.recommendation]?.variant ?? "secondary"}>{DECISION_LABEL[latest.recommendation]?.label ?? latest.recommendation}</Badge>
            {latest.applied && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldAlert className="h-3 w-3" /> sudah diterapkan
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{latest.reasoning}</p>
          {!latest.applied && (
            <Button size="sm" variant="secondary" disabled={applyingId === latest.id} onClick={() => handleApply(latest.id, latest.recommendation)}>
              {applyingId === latest.id ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : latest.recommendation === "pause" ? (
                <PauseCircle className="mr-1 h-3.5 w-3.5" />
              ) : (
                <PlayCircle className="mr-1 h-3.5 w-3.5" />
              )}
              Terapkan
            </Button>
          )}
          {!latest.applied && latest.recommendation !== "pause" && (
            <p className="text-[11px] text-muted-foreground">
              Catatan: hanya rekomendasi PAUSE yang mengubah status di sini secara otomatis -- SCALE/REDUCE/MAINTAIN masih perlu disesuaikan manual di Meta Business Manager (mode ASSISTED).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
