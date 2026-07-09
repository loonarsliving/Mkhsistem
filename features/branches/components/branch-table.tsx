"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDistanceMeters } from "@/lib/utils";
import type { Branch } from "@/types/domain";

import { deleteBranchAction } from "../actions/branch.actions";
import type { BranchInput } from "../schemas/branch.schema";
import { BranchFormDialog } from "./branch-form-dialog";

export function BranchTable({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    const result = await deleteBranchAction(deletingId);
    setDeleting(false);
    setDeletingId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus cabang");
      return;
    }
    toast.success("Cabang dihapus");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <BranchFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Tambah Cabang
            </Button>
          }
        />
      </div>

      {branches.length === 0 ? (
        <EmptyState icon={Building2} title="Belum ada cabang" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cabang</TableHead>
              <TableHead>Kota</TableHead>
              <TableHead>Radius</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((branch) => {
              const formValues: BranchInput = {
                id: branch.id,
                code: branch.code,
                name: branch.name,
                address: branch.address ?? "",
                city: branch.city ?? "",
                latitude: branch.latitude,
                longitude: branch.longitude,
                radiusMeters: branch.radius_meters,
                phone: branch.phone ?? "",
                isHeadOffice: branch.is_head_office,
                isActive: branch.is_active,
              };
              return (
                <TableRow key={branch.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{branch.name}</p>
                      {branch.is_head_office && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{branch.code}</p>
                  </TableCell>
                  <TableCell>{branch.city ?? "-"}</TableCell>
                  <TableCell>{formatDistanceMeters(branch.radius_meters)}</TableCell>
                  <TableCell>
                    <Badge variant={branch.is_active ? "success" : "secondary"}>{branch.is_active ? "Aktif" : "Nonaktif"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <BranchFormDialog
                        initialValues={formValues}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => setDeletingId(branch.id)}>
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
        title="Hapus cabang ini?"
        description="Cabang dengan karyawan aktif tidak dapat dihapus."
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
