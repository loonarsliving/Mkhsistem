"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveCreativeVariantAction, listCreativeVariantsAction, rejectCreativeVariantAction } from "../actions/occupancy-ads.actions";

const APPROVAL_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  pending: "secondary",
  approved: "success",
  rejected: "destructive",
};

/** Lists loonars_creative_variants rows for a campaign (spec: 1-3 asset+angle pairings per brief, migration 0269) with a per-variant approve/reject action. */
export function CreativeVariantsList({ campaignId, canManage }: { campaignId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { data: variants, isLoading } = useQuery({
    queryKey: ["occupancy-creative-variants", campaignId],
    queryFn: () => listCreativeVariantsAction(campaignId),
  });

  async function handleDecision(action: (id: string) => Promise<{ success: boolean; error?: string }>, id: string) {
    const result = await action(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["occupancy-creative-variants", campaignId] });
  }

  if (isLoading) return <p className="text-xs text-muted-foreground">Memuat varian kreatif...</p>;
  if (!variants || variants.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Varian Kreatif ({variants.length})</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {variants.map((v) => (
          <div key={v.id} className="space-y-1 rounded-md border p-2 text-xs">
            <div className="flex items-center justify-between">
              <Badge variant={APPROVAL_VARIANT[v.approval_state] ?? "secondary"}>{v.approval_state}</Badge>
              <span className="text-muted-foreground">{v.format}</span>
            </div>
            <p className="font-medium">{v.generated_headline}</p>
            <p className="text-muted-foreground">{v.generated_primary_text}</p>
            {canManage && v.approval_state === "pending" && (
              <div className="flex gap-1.5 pt-1">
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleDecision(approveCreativeVariantAction, v.id)}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleDecision(rejectCreativeVariantAction, v.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

