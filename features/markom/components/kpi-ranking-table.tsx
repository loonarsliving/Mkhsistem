"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { kpiRankingAction } from "../actions/markom-query.actions";

export function KpiRankingTable() {
  const [scope, setScope] = React.useState<"weekly" | "monthly">("monthly");

  const { data, isLoading } = useQuery({
    queryKey: ["markom-ranking", scope],
    queryFn: () => kpiRankingAction(scope),
  });

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Ranking Markom</CardTitle>
        <Tabs value={scope} onValueChange={(v) => setScope(v as "weekly" | "monthly")}>
          <TabsList>
            <TabsTrigger value="weekly">Mingguan</TabsTrigger>
            <TabsTrigger value="monthly">Bulanan</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {!isLoading && rows.length === 0 ? (
          <EmptyState icon={Trophy} title="Belum ada data ranking" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead className="text-right">Selesai/Total</TableHead>
                  <TableHead className="text-right">Achievement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.employee_id}>
                    <TableCell className="font-medium tabular-nums">{r.rank}</TableCell>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{r.branch_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.completed}/{r.assigned}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular-nums">{r.achievement_percent}%</span>
                        <Progress value={r.achievement_percent} tone="success" className="w-16" />
                      </div>
                    </TableCell>
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
