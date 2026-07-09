"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { EmploymentStatusBadge } from "@/components/shared/status-badge";
import { DEFAULT_PAGE_SIZE, type EmploymentStatus } from "@/constants/app";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";
import { useDebounce } from "@/hooks/use-debounce";
import { getInitials } from "@/lib/utils";

import { listEmployeesAction } from "../actions/employee-query.actions";

export function EmployeeTable({ canCreate, canViewAllBranches }: { canCreate: boolean; canViewAllBranches: boolean }) {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [branchId, setBranchId] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const debouncedSearch = useDebounce(search, 300);

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction, enabled: canViewAllBranches });

  const filters = {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    search: debouncedSearch || undefined,
    branchId: branchId === "all" ? undefined : branchId,
    employmentStatus: status === "all" ? undefined : status,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["employees", filters],
    queryFn: () => listEmployeesAction(filters),
  });

  const items = data?.items ?? [];

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cari</label>
            <Input
              placeholder="Cari nama, kode, atau email..."
              value={search}
              onChange={(e) => (setPage(1), setSearch(e.target.value))}
            />
          </div>
          {canViewAllBranches && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cabang</label>
              <Select value={branchId} onValueChange={(v) => (setPage(1), setBranchId(v))}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Cabang</SelectItem>
                  {branches?.map((b) => (
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
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Tidak Aktif</SelectItem>
                <SelectItem value="on_leave">Cuti</SelectItem>
                <SelectItem value="terminated">Berhenti</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canCreate && (
            <Button asChild className="ml-auto">
              <Link href="/employees/new">
                <Plus className="h-4 w-4" /> Tambah Karyawan
              </Link>
            </Button>
          )}
        </div>

        {!isLoading && items.length === 0 ? (
          <EmptyState icon={Users} title="Tidak ada karyawan ditemukan" description="Coba ubah kata kunci atau filter pencarian." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Karyawan</TableHead>
                <TableHead>Cabang</TableHead>
                <TableHead>Divisi</TableHead>
                <TableHead>Jabatan</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((employee) => (
                <TableRow key={employee.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/employees/${employee.id}`} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={employee.avatar_url ?? undefined} alt={employee.full_name} />
                        <AvatarFallback className="text-xs">{getInitials(employee.full_name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{employee.full_name}</p>
                        <p className="text-xs text-muted-foreground">{employee.employee_code}</p>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>{employee.branch_name}</TableCell>
                  <TableCell>{employee.division_name ?? "-"}</TableCell>
                  <TableCell>{employee.position_name ?? "-"}</TableCell>
                  <TableCell>{employee.role_name}</TableCell>
                  <TableCell>
                    <EmploymentStatusBadge status={employee.employment_status as EmploymentStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}
