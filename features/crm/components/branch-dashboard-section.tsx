import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Percent, Target, Users, Wallet } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { branchStatsAction } from "../actions/crm-query.actions";

interface SalesPerformanceRow {
  sales_id: string;
  full_name: string;
  target_units: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

export function BranchDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof branchStatsAction>> }) {
  if (!stats) return null;
  const salesRanking = (stats.sales_performance ?? []) as unknown as SalesPerformanceRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">CRM — Ringkasan Cabang</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/crm">Prospect Cabang</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <SectionLabel>Target</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={Target} label="Target Unit" value={String(stats.target_units)} />
            <StatTile icon={Wallet} label="Target Revenue" value={formatCurrency(stats.target_revenue)} />
            <StatTile icon={Users} label="Sales Aktif" value={String(stats.active_sales_count)} />
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Realisasi</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={CheckCircle2} label="Closing Unit" value={String(stats.closing_units)} tone="success" />
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

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">Baru {stats.prospects_red}</span>
          <span className="rounded-full bg-warning/10 px-3 py-1 font-medium text-warning">Follow Up {stats.prospects_yellow}</span>
          <span className="rounded-full bg-success/10 px-3 py-1 font-medium text-success">Verifikasi {stats.prospects_green}</span>
          <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Closing {stats.prospects_closing}</span>
        </div>

        {salesRanking.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Ranking Sales</SectionLabel>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Achievement</TableHead>
                    <TableHead className="text-right">Collection</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesRanking.map((row, i) => (
                    <TableRow key={row.sales_id}>
                      <TableCell className="font-medium tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">{row.full_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.target_units}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.closing_units}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.achievement_percent}%</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.collection)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
