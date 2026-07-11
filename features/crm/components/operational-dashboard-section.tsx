import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Percent, Target, TrendingUp, Wallet } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { nationalStatsAction } from "../actions/crm-query.actions";

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
  target_revenue: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

/** Director of Operations: branch/sales performance oversight. No commission -- that's personal pay, not an operational KPI. */
export function OperationalDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof nationalStatsAction>> }) {
  if (!stats) return null;
  const topSales = (stats.top_sales ?? []) as unknown as RankingRow[];
  const branchRanking = (stats.branch_ranking ?? []) as unknown as BranchRankingRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">CRM — Direktur Operasional</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/crm/analytics">Analitik Lengkap</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <SectionLabel>Target Perusahaan</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={Target} label="Company Target (Unit)" value={String(stats.total_target_units)} />
            <StatTile icon={Wallet} label="Company Revenue Target" value={formatCurrency(stats.total_target_revenue)} />
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Realisasi</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={CheckCircle2} label="Closing Unit" value={String(stats.total_closing_units)} tone="success" />
            <StatTile icon={Wallet} label="Collection" value={formatCurrency(stats.collection)} tone="success" />
            <StatTile icon={Percent} label="Achievement" value={`${stats.achievement_percent}%`} tone="success" />
          </div>
        </div>

        <StatTile
          icon={ClipboardCheck}
          label="Menunggu Verifikasi Finance"
          value={String(stats.pending_finance_verification)}
          tone={stats.pending_finance_verification > 0 ? "warning" : "default"}
          className="sm:max-w-xs"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp className="h-4 w-4" /> Performa &amp; Ranking Cabang
            </p>
            <ol className="space-y-1.5">
              {branchRanking.map((b, i) => (
                <li key={b.branch_id} className="rounded-md border border-border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                      {b.branch_name}
                    </span>
                    <span className="font-medium tabular-nums">{b.achievement_percent}%</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {b.closing_units}/{b.target_units} unit
                    </span>
                    <span>{formatCurrency(b.collection)}</span>
                  </div>
                </li>
              ))}
              {branchRanking.length === 0 && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
            </ol>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Ranking Sales (Achievement %)</p>
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
