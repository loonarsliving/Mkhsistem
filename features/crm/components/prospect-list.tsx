"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { ProspectStatusBadge } from "@/components/shared/status-badge";
import { DEFAULT_PAGE_SIZE, PROSPECT_STATUS_LABEL } from "@/constants/app";
import { useDebounce } from "@/hooks/use-debounce";
import type { ProspectStatusDb } from "@/types/database.types";

import { listProspectsAction } from "../actions/crm-query.actions";

interface ProspectRow {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  status: ProspectStatusDb;
  created_at: string;
  sales: { full_name: string } | null;
}

export function ProspectList() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 300);

  const filters = {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    status: status === "all" ? undefined : (status as ProspectStatusDb),
    search: debouncedSearch || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["crm-prospects", filters],
    queryFn: () => listProspectsAction(filters),
  });

  const items = (data?.items ?? []) as unknown as ProspectRow[];

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cari</label>
            <Input
              placeholder="Nama atau nomor telepon..."
              value={search}
              onChange={(e) => (setPage(1), setSearch(e.target.value))}
              className="w-56"
            />
          </div>
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
        </div>

        {!isLoading && items.length === 0 ? (
          <EmptyState icon={Users} title="Belum ada prospect" description="Tambahkan prospect baru untuk mulai melacak penjualan." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Kota</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Status</TableHead>
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
                    <TableCell>{row.sales?.full_name ?? "-"}</TableCell>
                    <TableCell>
                      <ProspectStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {format(new Date(row.created_at), "dd MMM yyyy", { locale: idLocale })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}
