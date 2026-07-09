"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Network, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";

import { deleteDivisionAction } from "../actions/division.actions";
import type { DivisionInput } from "../schemas/division.schema";
import { DivisionFormDialog } from "./division-form-dialog";

interface DivisionRow {
  id: string;
  branch_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  branches: { name: string } | null;
}

export function DivisionTable({ divisions }: { divisions: DivisionRow[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    const result = await deleteDivisionAction(deletingId);
    setDeleting(false);
    setDeletingId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus divisi");
      return;
    }
    toast.success("Divisi dihapus");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DivisionFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Tambah Divisi
            </Button>
          }
        />
      </div>

      {divisions.length === 0 ? (
        <EmptyState icon={Network} title="Belum ada divisi" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Cabang</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {divisions.map((division) => {
              const formValues: DivisionInput = {
                id: division.id,
                branchId: division.branch_id,
                code: division.code ?? "",
                name: division.name,
                description: division.description ?? "",
                isActive: division.is_active,
              };
              return (
                <TableRow key={division.id}>
                  <TableCell className="font-medium">{division.name}</TableCell>
                  <TableCell>{division.branches?.name ?? "Semua Cabang"}</TableCell>
                  <TableCell>
                    <Badge variant={division.is_active ? "success" : "secondary"}>
                      {division.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <DivisionFormDialog
                        initialValues={formValues}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => setDeletingId(division.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Hapus divisi ini?"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
