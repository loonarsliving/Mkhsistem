import Link from "next/link";
import { ClipboardCheck, Percent, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { nationalStatsAction } from "../actions/crm-query.actions";

interface BranchRankingRow {
  branch_id: string;
  branch_name: string;
  achievement_percent: number;
}

/**
 * Direktur Utama: pared-down executive KPIs only -- no per-Sales ranking,
 * no per-branch performance breakdown, and no commission ("Commission is
 * ONLY visible to the Sales who earned it"). Company Revenue here is the
 * company-wide Target Revenue (the executive-tier counterpart of Direktur
 * Operasional's "Company Revenue Target"); Collection is the actual money
 * verified by Finance so far this period.
 */
export function ExecutiveDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof nationalStatsAction>> }) {
  if (!stats) return null;
  const branchRanking = (stats.branch_ranking ?? []) as unknown as BranchRankingRow[];
  const growth = stats.monthly_growth_percent;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">CRM — Direktur Utama</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/crm/analytics">Analitik Lengkap</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={Wallet} label="Company Revenue" value={formatCurrency(stats.total_target_revenue)} />
          <StatTile icon={Wallet} label="Collection" value={formatCurrency(stats.collection)} tone="success" />
          <StatTile icon={Percent} label="Achievement" value={`${stats.achievement_percent}%`} tone="success" />
          <StatTile
            icon={growth !== null && growth < 0 ? TrendingDown : TrendingUp}
            label="Monthly Growth"
            value={growth === null ? "N/A" : `${growth > 0 ? "+" : ""}${growth}%`}
            tone={growth === null ? "default" : growth >= 0 ? "success" : "destructive"}
          />
        </div>

        <StatTile
          icon={ClipboardCheck}
          label="Pending Approvals"
          value={String(stats.pending_finance_verification)}
          tone={stats.pending_finance_verification > 0 ? "warning" : "default"}
          className="sm:max-w-xs"
        />

        <div>
          <p className="mb-2 text-sm font-medium">Ranking Cabang</p>
          <ol className="space-y-1.5">
            {branchRanking.map((b, i) => (
              <li key={b.branch_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                  {b.branch_name}
                </span>
                <span className="font-medium tabular-nums">{b.achievement_percent}%</span>
              </li>
            ))}
            {branchRanking.length === 0 && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
