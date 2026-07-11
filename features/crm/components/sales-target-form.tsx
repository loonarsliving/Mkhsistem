"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { upsertSalesTargetAction } from "../actions/crm.actions";
import { listSalesEmployeesAction, listSalesTargetsAction } from "../actions/crm-query.actions";

const MONTH_LABEL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function TargetRow({
  salesId,
  fullName,
  month,
  year,
  initialTargetUnits,
  initialCommissionPercent,
  onSaved,
}: {
  salesId: string;
  fullName: string;
  month: number;
  year: number;
  initialTargetUnits: number;
  initialCommissionPercent: number;
  onSaved: () => void;
}) {
  const [targetUnits, setTargetUnits] = React.useState(initialTargetUnits);
  const [commissionPercent, setCommissionPercent] = React.useState(initialCommissionPercent);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await upsertSalesTargetAction({
      salesId,
      periodMonth: month,
      periodYear: year,
      targetUnits,
      commissionPercent,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan target");
      return;
    }
    toast.success(`Target ${fullName} disimpan`);
    onSaved();
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{fullName}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          className="w-24"
          value={targetUnits}
          onChange={(e) => setTargetUnits(Number(e.target.value))}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={100}
          step="0.5"
          className="w-24"
          value={commissionPercent}
          onChange={(e) => setCommissionPercent(Number(e.target.value))}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function SalesTargetForm() {
  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const queryClient = useQueryClient();

  const { data: salesEmployees, isLoading: loadingEmployees } = useQuery({
    queryKey: ["crm-sales-employees"],
    queryFn: () => listSalesEmployeesAction(true),
  });
  const { data: targets, isLoading: loadingTargets } = useQuery({
    queryKey: ["crm-sales-targets", month, year],
    queryFn: () => listSalesTargetsAction(month, year),
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["crm-sales-targets", month, year] });
  }

  const targetBySalesId = new Map((targets ?? []).map((t) => [t.sales_id, t]));

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Bulan</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_LABEL.map((label, i) => (
                  <SelectItem key={label} value={String(i + 1)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tahun</label>
            <Input type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
        </div>

        {!loadingEmployees && !loadingTargets && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead>Target (Unit)</TableHead>
                  <TableHead>Komisi (%)</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(salesEmployees ?? []).map((emp) => {
                  const existing = targetBySalesId.get(emp.id);
                  return (
                    <TargetRow
                      key={`${emp.id}-${month}-${year}`}
                      salesId={emp.id}
                      fullName={emp.full_name}
                      month={month}
                      year={year}
                      initialTargetUnits={existing?.target_units ?? 0}
                      initialCommissionPercent={existing?.commission_percent ?? 0}
                      onSaved={refetch}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
