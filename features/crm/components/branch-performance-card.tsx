import { CheckCircle2, Target, TrendingUp, Wallet } from "lucide-react";

import { RevenueTile } from "@/components/shared/revenue-tile";
import { StatTile } from "@/components/shared/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { branchStatsAction } from "../actions/crm-query.actions";

/**
 * Branch Manager's primary Home Dashboard widget -- whole-branch KPIs only
 * (crm_branch_stats), never per-sales data. This is the Branch Manager's
 * core responsibility (managing branch sales performance), so it renders
 * first, above the Markom Team widget.
 */
export function BranchPerformanceCard({ stats }: { stats: Awaited<ReturnType<typeof branchStatsAction>> }) {
  if (!stats) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Branch Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={Target} label="Target Unit Cabang" value={String(stats.target_units)} />
          <StatTile icon={CheckCircle2} label="Closing Unit Cabang" value={String(stats.closing_units)} tone="success" />
          <StatTile icon={TrendingUp} label="Achievement Cabang" value={`${stats.achievement_percent}%`} tone="success" />
          <RevenueTile icon={Wallet} label="Target Revenue Cabang" value={formatCurrency(stats.target_revenue)} />
          <RevenueTile icon={Wallet} label="Collection Cabang" value={formatCurrency(stats.collection)} tone="success" />
        </div>
      </CardContent>
    </Card>
  );
}
