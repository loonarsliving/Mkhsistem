import Link from "next/link";
import { ArrowRight, CheckCircle2, Percent, Trophy, Users, Wallet } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadSourceChart } from "@/features/crm/components/lead-source-chart";
import { MonthlyTrendChart } from "@/features/crm/components/monthly-trend-chart";
import { formatCurrency } from "@/lib/utils";
import type { conversionAnalyticsAction, monthlyTrendAction, nationalStatsAction } from "@/features/crm/actions/crm-query.actions";

interface BranchRankingRow {
  branch_id: string;
  branch_name: string;
  achievement_percent: number;
}

/**
 * The ONLY CRM element allowed on the Executive Dashboard: a single summary
 * card plus a shortcut into the CRM module. It is not a drill-down surface --
 * no prospect lists, no per-sales data, no funnels, no branch/sales
 * management. Top Project Performance is intentionally omitted: Project
 * Master is currently unused (0 prospects reference a project), matching
 * the same "hide until real data exists" rule the CRM drill-down nav uses.
 */
export function CrmDirectorSummaryCard({
  stats,
  conversion,
  trend,
}: {
  stats: Awaited<ReturnType<typeof nationalStatsAction>>;
  conversion: Awaited<ReturnType<typeof conversionAnalyticsAction>> | null;
  trend: Awaited<ReturnType<typeof monthlyTrendAction>>;
}) {
  if (!stats) return null;
  const branchRanking = ((stats.branch_ranking ?? []) as unknown as BranchRankingRow[]).slice(0, 3);

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
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile icon={Users} label="Total Prospect" value={String(conversion?.total_prospects ?? 0)} />
          <StatTile icon={CheckCircle2} label="Total Closing" value={String(conversion?.total_closing ?? 0)} tone="success" />
          <StatTile icon={Percent} label="Conversion Rate" value={`${conversion?.conversion_percent ?? 0}%`} />
          <StatTile icon={Wallet} label="Total Revenue" value={formatCurrency(stats.total_target_revenue)} />
          <StatTile icon={Wallet} label="Total Collection" value={formatCurrency(stats.collection)} tone="success" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <MonthlyTrendChart data={trend} />
          <LeadSourceChart data={(conversion?.lead_source_performance ?? []) as never} />
        </div>

        {branchRanking.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Top Branch Performance</p>
            <ol className="space-y-1.5">
              {branchRanking.map((b, i) => (
                <li key={b.branch_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    {b.branch_name}
                  </span>
                  <span className="font-medium tabular-nums">{b.achievement_percent}%</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
