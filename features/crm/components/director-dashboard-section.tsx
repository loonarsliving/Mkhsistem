import Link from "next/link";
import { Coins, Percent, TrendingUp, Users, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { nationalStatsAction } from "../actions/crm-query.actions";

import { StatTile } from "./stat-tile";

interface RankingRow {
  sales_id: string;
  full_name: string;
  branch_name: string;
  target_units: number;
  closing_units: number;
  achievement_percent: number;
}

interface BranchRankingRow {
  branch_id: string;
  branch_name: string;
  target_units: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
}

export function DirectorDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof nationalStatsAction>> }) {
  if (!stats) return null;
  const topSales = (stats.top_sales ?? []) as unknown as RankingRow[];
  const branchRanking = (stats.branch_ranking ?? []) as unknown as BranchRankingRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">CRM — Ringkasan Nasional</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/crm/analytics">Analitik Lengkap</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile icon={Users} label="Total Prospect" value={String(stats.total_prospects)} />
          <StatTile icon={TrendingUp} label="Closing" value={String(stats.prospects_closing)} tone="success" />
          <StatTile icon={Percent} label="Konversi" value={`${stats.conversion_percent}%`} />
          <StatTile icon={Wallet} label="Collection" value={formatCurrency(stats.collection)} />
          <StatTile icon={Coins} label="Komisi" value={formatCurrency(stats.commission)} tone="success" />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">Baru {stats.prospects_red}</span>
          <span className="rounded-full bg-warning/10 px-3 py-1 font-medium text-warning">Follow Up {stats.prospects_yellow}</span>
          <span className="rounded-full bg-success/10 px-3 py-1 font-medium text-success">Verifikasi {stats.prospects_green}</span>
          <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Closing {stats.prospects_closing}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Ranking Cabang (Achievement %)</p>
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
          <div>
            <p className="mb-2 text-sm font-medium">Top Sales (Achievement %)</p>
            <ol className="space-y-1.5">
              {topSales.map((s, i) => (
                <li key={s.sales_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <span>
                      {s.full_name}
                      <span className="ml-1 text-xs text-muted-foreground">({s.branch_name})</span>
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{s.achievement_percent}%</span>
                </li>
              ))}
              {topSales.length === 0 && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
