"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Percent } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { listCommissionRatesAction } from "../actions/siteplan.actions";
import { CommissionRateFormDialog } from "./commission-rate-form-dialog";

const QUERY_KEY = ["siteplan-commission-rates"];

/** Admin-managed per-employee commission rate (0275) -- loonars_unit_fee_request multiplies this against a purchase's price for any fee_rate_based project (Loonars 2 only for now). */
export function CommissionRateManager() {
  const queryClient = useQueryClient();
  const { data: rates, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: listCommissionRatesAction });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Rate Komisi Sales</CardTitle>
        <CommissionRateFormDialog
          trigger={
            <Button size="sm" variant="outline">
              <Percent className="h-4 w-4" /> Tambah Rate
            </Button>
          }
          onSaved={invalidate}
        />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !rates || rates.length === 0 ? (
          <EmptyState
            icon={Percent}
            title="Belum ada rate komisi"
            description="Tambah rate komisi per sales agar fee di project dengan hitung-otomatis (Loonars 2) bisa dihitung sistem."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.employees?.full_name ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.commission_rate_percent}%</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <CommissionRateFormDialog
                          initialValues={{
                            employeeId: r.employee_id,
                            commissionRatePercent: r.commission_rate_percent,
                            employeeName: r.employees?.full_name ?? "-",
                          }}
                          trigger={
                            <Button size="sm" variant="ghost">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                          onSaved={invalidate}
                        />
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
