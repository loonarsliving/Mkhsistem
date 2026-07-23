"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarCheck, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { AttendanceStatusBadge } from "@/components/shared/status-badge";
import { ATTENDANCE_STATUS, DEFAULT_PAGE_SIZE, type AttendanceStatus } from "@/constants/app";
import { getInitials } from "@/lib/utils";
import type { AttendanceHistoryFilters } from "@/repositories/attendance.repository";

import { exportAttendanceHistoryCsvAction, listAttendanceHistoryAction } from "../actions/attendance-query.actions";
import { AttendanceDetailDialog } from "./attendance-detail-dialog";

interface AttendanceRow {
  id: string;
  attendance_date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_within_radius: boolean | null;
  check_out_within_radius: boolean | null;
  employees: { full_name: string; avatar_url: string | null; employee_code: string } | null;
}

export function AttendanceHistoryTable({ showEmployeeColumn }: { showEmployeeColumn: boolean }) {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<string>("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const filters: AttendanceHistoryFilters = {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    status: status === "all" ? undefined : (status as AttendanceStatus),
    from: from || undefined,
    to: to || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-history", filters],
    queryFn: () => listAttendanceHistoryAction(filters),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportAttendanceHistoryCsvAction(filters);
      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `riwayat-absensi-${format(new Date(), "yyyy-MM-dd")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const items = (data?.items ?? []) as unknown as AttendanceRow[];

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Dari Tanggal</label>
            <Input type="date" value={from} onChange={(e) => (setPage(1), setFrom(e.target.value))} className="w-auto" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sampai Tanggal</label>
            <Input type="date" value={to} onChange={(e) => (setPage(1), setTo(e.target.value))} className="w-auto" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => (setPage(1), setStatus(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {Object.values(ATTENDANCE_STATUS).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="ml-auto" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        {!isLoading && items.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Tidak ada data kehadiran" description="Coba ubah filter pencarian Anda." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                {showEmployeeColumn && <TableHead>Karyawan</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Jam Masuk</TableHead>
                <TableHead>Jam Pulang</TableHead>
                <TableHead>Lokasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedId(row.id)}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(row.attendance_date), "dd MMM yyyy", { locale: idLocale })}
                  </TableCell>
                  {showEmployeeColumn && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {row.employees ? getInitials(row.employees.full_name) : "-"}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{row.employees?.full_name ?? "-"}</p>
                          <p className="text-xs text-muted-foreground">{row.employees?.employee_code}</p>
                        </div>
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <AttendanceStatusBadge status={row.status as AttendanceStatus} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.check_in_time ? format(new Date(row.check_in_time), "HH:mm") : "-"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.check_out_time ? format(new Date(row.check_out_time), "HH:mm") : "-"}
                  </TableCell>
                  <TableCell>
                    {row.check_in_within_radius === false || row.check_out_within_radius === false ? (
                      <span className="text-xs font-medium text-destructive">Di luar radius</span>
                    ) : row.check_in_time ? (
                      <span className="text-xs text-success">Dalam radius</span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </CardContent>

      <AttendanceDetailDialog attendanceId={selectedId} open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)} />
    </Card>
  );
}
