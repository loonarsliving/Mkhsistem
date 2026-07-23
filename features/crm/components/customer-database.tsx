"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Download, Printer, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { ProspectStatusBadge } from "@/components/shared/status-badge";
import { DEFAULT_PAGE_SIZE, LEAD_SOURCE_LABEL, PROSPECT_STATUS_LABEL } from "@/constants/app";
import { useDebounce } from "@/hooks/use-debounce";
import { exportRowsToExcel, type ExcelColumn } from "@/lib/export/excel";
import type { LeadSourceDb, ProspectStatusDb } from "@/types/database.types";

import { exportCustomerDatabaseAction, listCustomerDatabaseAction } from "../actions/crm-query.actions";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";

interface CustomerRow {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  status: ProspectStatusDb;
  lead_source: LeadSourceDb;
  created_at: string;
  sales: { full_name: string } | null;
  branch: { name: string } | null;
}

export function CustomerDatabase({ canPickBranch }: { canPickBranch: boolean }) {
  const [page, setPage] = React.useState(1);
  const [branchId, setBranchId] = React.useState<string>("all");
  const [status, setStatus] = React.useState<string>("all");
  const [leadSource, setLeadSource] = React.useState<string>("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [isExporting, setIsExporting] = React.useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const { data: branches } = useQuery({
    queryKey: ["crm-customer-database-branches"],
    queryFn: () => listBranchesAction(),
    enabled: canPickBranch,
  });

  const filters = {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    branchId: canPickBranch && branchId !== "all" ? branchId : undefined,
    status: status === "all" ? undefined : (status as ProspectStatusDb),
    leadSource: leadSource === "all" ? undefined : (leadSource as LeadSourceDb),
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: debouncedSearch || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["crm-customer-database", filters],
    queryFn: () => listCustomerDatabaseAction(filters),
  });

  const items = (data?.items ?? []) as unknown as CustomerRow[];

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const { page: _page, pageSize: _pageSize, ...exportFilters } = filters;
      const rows = (await exportCustomerDatabaseAction(exportFilters)) as unknown as CustomerRow[];
      const columns: ExcelColumn<CustomerRow>[] = [
        { header: "Nama Pelanggan", key: "customer_name", width: 28, value: (r) => r.customer_name },
        { header: "Nomor Telepon", key: "phone", width: 18, value: (r) => r.phone },
        { header: "Kota", key: "city", width: 18, value: (r) => r.city },
        { header: "Cabang", key: "branch", width: 20, value: (r) => r.branch?.name ?? "-" },
        { header: "Sales", key: "sales", width: 20, value: (r) => r.sales?.full_name ?? "-" },
        { header: "Status", key: "status", width: 18, value: (r) => PROSPECT_STATUS_LABEL[r.status] },
        { header: "Sumber Prospect", key: "lead_source", width: 18, value: (r) => LEAD_SOURCE_LABEL[r.lead_source] },
        {
          header: "Tanggal Dibuat",
          key: "created_at",
          width: 18,
          value: (r) => format(new Date(r.created_at), "dd MMM yyyy", { locale: idLocale }),
        },
      ];
      await exportRowsToExcel(rows, columns, "Database Pelanggan", `database-pelanggan-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Ekspor Excel berhasil");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengekspor data");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="no-print flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cari</label>
            <Input
              placeholder="Nama atau nomor telepon..."
              value={search}
              onChange={(e) => (setPage(1), setSearch(e.target.value))}
              className="w-56"
            />
          </div>
          {canPickBranch && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cabang</label>
              <Select value={branchId} onValueChange={(v) => (setPage(1), setBranchId(v))}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Cabang</SelectItem>
                  {(branches ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => (setPage(1), setStatus(v))}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {Object.entries(PROSPECT_STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sumber Prospect</label>
            <Select value={leadSource} onValueChange={(v) => (setPage(1), setLeadSource(v))}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Sumber</SelectItem>
                {Object.entries(LEAD_SOURCE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Dari Tanggal</label>
            <Input type="date" value={dateFrom} onChange={(e) => (setPage(1), setDateFrom(e.target.value))} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sampai Tanggal</label>
            <Input type="date" value={dateTo} onChange={(e) => (setPage(1), setDateTo(e.target.value))} className="w-40" />
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={handleExportExcel} disabled={isExporting}>
              <Download className="h-4 w-4" />
              {isExporting ? "Mengekspor..." : "Ekspor Excel"}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Cetak / Ekspor PDF
            </Button>
          </div>
        </div>

        <div className="print-area">
          {!isLoading && items.length === 0 ? (
            <EmptyState icon={Users} title="Belum ada pelanggan" description="Tidak ada data pelanggan yang cocok dengan filter." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Kota</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sumber Prospect</TableHead>
                    <TableHead>Dibuat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer">
                      <TableCell>
                        <Link href={`/crm/${row.id}`} className="block hover:underline">
                          <p className="font-medium">{row.customer_name}</p>
                          <p className="text-xs text-muted-foreground">{row.phone}</p>
                        </Link>
                      </TableCell>
                      <TableCell>{row.city}</TableCell>
                      <TableCell>{row.branch?.name ?? "-"}</TableCell>
                      <TableCell>{row.sales?.full_name ?? "-"}</TableCell>
                      <TableCell>
                        <ProspectStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>{LEAD_SOURCE_LABEL[row.lead_source] ?? row.lead_source}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(row.created_at), "dd MMM yyyy", { locale: idLocale })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="no-print">
          <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      </CardContent>
    </Card>
  );
}
