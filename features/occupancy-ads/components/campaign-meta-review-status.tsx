"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOccupancyCampaignMetaStatusAction } from "../actions/occupancy-ads.actions";

/**
 * Meta's own effective_status is a much larger set than what's documented
 * here -- this only labels the values an advertiser actually encounters
 * day to day. Anything else falls back to showing the raw value, never a
 * guessed/fabricated label.
 */
const EFFECTIVE_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive"; icon: React.ComponentType<{ className?: string }> }> = {
  ACTIVE: { label: "Aktif Tayang", variant: "success", icon: CheckCircle2 },
  PENDING_REVIEW: { label: "Masih Direview Meta", variant: "secondary", icon: Clock },
  IN_PROCESS: { label: "Masih Diproses Meta", variant: "secondary", icon: Clock },
  PREAPPROVED: { label: "Pra-disetujui (belum tayang)", variant: "secondary", icon: Clock },
  DISAPPROVED: { label: "Ditolak Meta", variant: "destructive", icon: AlertTriangle },
  WITH_ISSUES: { label: "Ada Masalah", variant: "destructive", icon: AlertTriangle },
  PENDING_BILLING_INFO: { label: "Menunggu Info Billing", variant: "destructive", icon: AlertTriangle },
  PAUSED: { label: "Dijeda (di iklan)", variant: "secondary", icon: Clock },
  ADSET_PAUSED: { label: "Dijeda (di ad set)", variant: "secondary", icon: Clock },
  CAMPAIGN_PAUSED: { label: "Dijeda (di campaign)", variant: "secondary", icon: Clock },
  ARCHIVED: { label: "Diarsipkan di Meta", variant: "secondary", icon: Clock },
  DELETED: { label: "Dihapus di Meta", variant: "destructive", icon: AlertTriangle },
};

/**
 * On-demand check of Meta's actual review/delivery status for an already-
 * launched campaign (spec follow-up: our local "Aktif" only means the
 * launch API call succeeded, not that Meta finished reviewing it). Never
 * auto-polls -- the admin clicks "Cek Status Review Meta" when they want
 * to know, since there's no automation dispatch for this module yet.
 */
export function CampaignMetaReviewStatus({ campaignId, hasMetaAdId }: { campaignId: string; hasMetaAdId: boolean }) {
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<{ effectiveStatus: string; configuredStatus: string; rejectionReasons: string[] } | null>(null);

  if (!hasMetaAdId) return null;

  async function handleCheck() {
    setChecking(true);
    const result = await getOccupancyCampaignMetaStatusAction(campaignId);
    setChecking(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setResult(result.data ?? null);
  }

  const known = result ? EFFECTIVE_STATUS_LABEL[result.effectiveStatus] : null;

  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Status Review Meta</p>
        <Button size="sm" variant="outline" disabled={checking} onClick={handleCheck}>
          {checking ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Cek Status Review Meta
        </Button>
      </div>
      {result && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={known?.variant ?? "secondary"} className="gap-1">
              {known ? <known.icon className="h-3 w-3" /> : <HelpCircle className="h-3 w-3" />}
              {known?.label ?? result.effectiveStatus}
            </Badge>
            <span className="text-[11px] text-muted-foreground">({result.effectiveStatus})</span>
          </div>
          {result.rejectionReasons.length > 0 && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <p className="font-medium">Alasan ditolak Meta:</p>
              <ul className="ml-4 list-disc">
                {result.rejectionReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
