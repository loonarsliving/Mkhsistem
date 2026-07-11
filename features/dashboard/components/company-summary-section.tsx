import { CheckCircle2, Percent, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { nationalStatsAction } from "@/features/crm/actions/crm-query.actions";

/**
 * Executive Summary top-level KPIs for Director / Director of Operations --
 * "how is the company performing", nothing operational. Branch/Sales
 * breakdowns, rankings and prospect funnels live in the CRM module now, not
 * here (see /crm/dashboard).
 */
export function CompanySummarySection({ stats }: { stats: Awaited<ReturnType<typeof nationalStatsAction>> }) {
  if (!stats) return null;
  const growth = stats.monthly_growth_percent;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ringkasan Eksekutif</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile icon={Wallet} label="Company Revenue" value={formatCurrency(stats.total_target_revenue)} />
          <StatTile icon={Wallet} label="Company Collection" value={formatCurrency(stats.collection)} tone="success" />
          <StatTile icon={Target} label="Company Target" value={String(stats.total_target_units)} />
          <StatTile icon={Percent} label="Achievement" value={`${stats.achievement_percent}%`} tone="success" />
          <StatTile
            icon={growth !== null && growth < 0 ? TrendingDown : TrendingUp}
            label="Monthly Growth"
            value={growth === null ? "N/A" : `${growth > 0 ? "+" : ""}${growth}%`}
            tone={growth === null ? "default" : growth >= 0 ? "success" : "destructive"}
          />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Detail performa cabang, sales, dan prospect ada di modul CRM.
        </div>
      </CardContent>
    </Card>
  );
}
