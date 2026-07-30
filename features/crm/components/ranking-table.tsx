"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils";

import { salesRankingAction } from "../actions/crm-query.actions";

/**
 * `showCollection` must be false for a Kepala Cabang caller (crm_analytics.view_branch
 * only) -- Collection is the real Rupiah value of closings, Super Admin/CFO territory.
 * crm_sales_ranking already nulls it server-side for that caller as defense-in-depth.
 */
export function RankingTable({ showCollection = true }: { showCollection?: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ["crm-ranking"], queryFn: () => salesRankingAction() });
  const items = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ranking Sales (Achievement %)</CardTitle>
      </CardHeader>
      <CardContent>
        {!isLoading && items.length === 0 ? (
          <EmptyState icon={Trophy} title="Belum ada data ranking" description="Ranking muncul setelah target dan closing tercatat." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead className="text-right">Achievement</TableHead>
                  {showCollection && <TableHead className="text-right">Collection</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.sales_id}>
                    <TableCell className="tabular-nums">{row.rank}</TableCell>
                    <TableCell className="font-medium">{row.full_name}</TableCell>
                    <TableCell>{row.branch_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.target_units}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.closing_units}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{row.achievement_percent}%</TableCell>
                    {showCollection && <TableCell className="text-right tabular-nums">{formatCurrency(row.collection)}</TableCell>}
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
