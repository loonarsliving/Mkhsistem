import Link from "next/link";
import { CheckCircle2, Coins, Percent, Target, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { branchStatsAction } from "../actions/crm-query.actions";

import { StatTile } from "./stat-tile";

interface SalesPerformanceRow {
  sales_id: string;
  full_name: string;
  target_units: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
  commission: number;
}

export function BranchDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof branchStatsAction>> }) {
  if (!stats) return null;
  const salesPerformance = (stats.sales_performance ?? []) as unknown as SalesPerformanceRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">CRM — Ringkasan Cabang</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/crm">Prospect Cabang</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile icon={Target} label="Target Cabang" value={String(stats.target_units)} />
          <StatTile icon={CheckCircle2} label="Closing" value={String(stats.closing_units)} tone="success" />
          <StatTile icon={Percent} label="Achievement" value={`${stats.achievement_percent}%`} tone="success" />
          <StatTile icon={Wallet} label="Collection" value={formatCurrency(stats.collection)} />
          <StatTile icon={Coins} label="Komisi Cabang" value={formatCurrency(stats.commission)} tone="success" />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">Baru {stats.prospects_red}</span>
          <span className="rounded-full bg-warning/10 px-3 py-1 font-medium text-warning">Follow Up {stats.prospects_yellow}</span>
          <span className="rounded-full bg-success/10 px-3 py-1 font-medium text-success">Verifikasi {stats.prospects_green}</span>
          <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Closing {stats.prospects_closing}</span>
        </div>

        {salesPerformance.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead className="text-right">Achievement</TableHead>
                  <TableHead className="text-right">Collection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesPerformance.map((row) => (
                  <TableRow key={row.sales_id}>
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
        )}
      </CardContent>
    </Card>
  );
}
