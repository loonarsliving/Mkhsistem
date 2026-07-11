import Link from "next/link";
import { Users } from "lucide-react";

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

/** Branch Manager's operational Sales Summary -- prospect funnel + per-sales performance for their own branch. */
export function BranchSalesSummaryCard({ stats }: { stats: Awaited<ReturnType<typeof branchStatsAction>> }) {
  if (!stats) return null;
  const salesRanking = (stats.sales_performance ?? []) as unknown as SalesPerformanceRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Sales Summary</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/crm/dashboard">Lihat CRM</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatTile icon={Users} label="Sales Aktif" value={String(stats.active_sales_count)} className="sm:max-w-xs" />

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">Baru {stats.prospects_red}</span>
          <span className="rounded-full bg-warning/10 px-3 py-1 font-medium text-warning">Follow Up {stats.prospects_yellow}</span>
          <span className="rounded-full bg-success/10 px-3 py-1 font-medium text-success">Verifikasi {stats.prospects_green}</span>
          <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Closing {stats.prospects_closing}</span>
        </div>

        {salesRanking.length > 0 && (
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
                {salesRanking.map((row) => (
                  <TableRow key={row.sales_id}>
                    <TableCell className="font-medium">
                      <Link href={`/crm/sales/${row.sales_id}`} className="hover:underline">
                        {row.full_name}
                      </Link>
                    </TableCell>
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
