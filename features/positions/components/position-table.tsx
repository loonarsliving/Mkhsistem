"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import type { Position } from "@/types/domain";

import { deletePositionAction } from "../actions/position.actions";
import type { PositionInput } from "../schemas/position.schema";
import { PositionFormDialog } from "./position-form-dialog";

export function PositionTable({ positions }: { positions: Position[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    const result = await deletePositionAction(deletingId);
    setDeleting(false);
    setDeletingId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus jabatan");
      return;
    }
    toast.success("Jabatan dihapus");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PositionFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Tambah Jabatan
            </Button>
          }
        />
      </div>

      {positions.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Belum ada jabatan" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kode</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => {
              const formValues: PositionInput = {
                id: position.id,
                code: position.code ?? "",
                name: position.name,
                level: position.level,
                description: position.description ?? "",
                isActive: position.is_active,
              };
              return (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">{position.name}</TableCell>
                  <TableCell>{position.code ?? "-"}</TableCell>
                  <TableCell>{position.level}</TableCell>
                  <TableCell>
                    <Badge variant={position.is_active ? "success" : "secondary"}>
                      {position.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <PositionFormDialog
                        initialValues={formValues}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => setDeletingId(position.id)}>
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
        title="Hapus jabatan ini?"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
