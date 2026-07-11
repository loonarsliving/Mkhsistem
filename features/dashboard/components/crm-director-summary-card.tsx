import Link from "next/link";
import { ArrowRight, Percent, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { nationalStatsAction } from "@/features/crm/actions/crm-query.actions";

/**
 * The ONLY CRM element allowed on the Executive Dashboard: a single summary
 * card plus a shortcut into the CRM module. It is not an analysis surface --
 * no branch/sales rankings, no prospect lists, no funnels. All of that lives
 * behind the "Buka CRM Dashboard" link at /crm/dashboard, never here.
 */
export function CrmDirectorSummaryCard({ stats }: { stats: Awaited<ReturnType<typeof nationalStatsAction>> }) {
  if (!stats) return null;
  const growth = stats.monthly_growth_percent;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">CRM — Ringkasan Direktur</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href="/crm/dashboard">
            Buka CRM Dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
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
      </CardContent>
    </Card>
  );
}
