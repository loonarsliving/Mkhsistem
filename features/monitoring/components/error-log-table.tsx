"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ShieldAlert } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { listErrorLogsAction } from "@/features/monitoring/actions/monitoring-query.actions";
import { resolveErrorLogAction } from "@/features/monitoring/actions/monitoring.actions";

const LEVEL_VARIANT: Record<string, BadgeProps["variant"]> = {
  warning: "warning",
  error: "destructive",
  fatal: "destructive",
};

type StatusFilter = "unresolved" | "resolved" | "all";

export function ErrorLogTable() {
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("unresolved");
  const queryClient = useQueryClient();

  const resolvedFilter = statusFilter === "all" ? undefined : statusFilter === "resolved";

  const { data, isLoading } = useQuery({
    queryKey: ["error-logs", page, statusFilter],
    queryFn: () => listErrorLogsAction(page, resolvedFilter),
  });

  const items = data?.items ?? [];

  async function handleResolve(id: string) {
    await resolveErrorLogAction(id);
    void queryClient.invalidateQueries({ queryKey: ["error-logs"] });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Log Error</h3>
          <Select value={statusFilter} onValueChange={(v) => (setPage(1), setStatusFilter(v as StatusFilter))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unresolved">Belum Selesai</SelectItem>
              <SelectItem value="resolved">Selesai</SelectItem>
              <SelectItem value="all">Semua</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!isLoading && items.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="Tidak ada error" description="Belum ada error yang tercatat pada filter ini." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Pesan</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.occurred_at).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={LEVEL_VARIANT[row.level]}>{row.level}</Badge>
                  </TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">{row.source}</TableCell>
                  <TableCell className="max-w-md truncate text-sm" title={row.message}>
                    {row.message}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-xs text-muted-foreground" title={row.url ?? undefined}>
                    {row.url ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {!row.resolved && (
                      <Button variant="outline" size="sm" onClick={() => handleResolve(row.id)}>
                        <CheckCircle2 className="h-4 w-4" /> Selesai
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Pagination page={page} pageSize={25} total={data?.total ?? 0} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}
