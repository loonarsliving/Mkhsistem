"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SiteplanUnitStatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { SiteplanUnitStatus } from "@/constants/app";

import { deleteSiteplanUnitAction, listSiteplanProjectsAction, listSiteplanUnitsAction } from "../actions/siteplan.actions";
import { SiteplanFeeQueue } from "./siteplan-fee-queue";
import { SiteplanProjectFormDialog } from "./siteplan-project-form-dialog";
import { SiteplanRowEditor } from "./siteplan-row-editor";
import { SiteplanUnitFormDialog } from "./siteplan-unit-form-dialog";

export function SiteplanAdminPanel() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading: loadingProjects } = useQuery({ queryKey: ["siteplan-projects"], queryFn: listSiteplanProjectsAction });
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!projectId && projects && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const unitsQueryKey = ["siteplan-admin-units", projectId];
  const { data: units, isLoading: loadingUnits } = useQuery({
    queryKey: unitsQueryKey,
    queryFn: () => listSiteplanUnitsAction(projectId as string),
    enabled: Boolean(projectId),
  });

  function invalidateProjects() {
    queryClient.invalidateQueries({ queryKey: ["siteplan-projects"] });
  }
  function invalidateUnits() {
    queryClient.invalidateQueries({ queryKey: unitsQueryKey });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteSiteplanUnitAction(deleteTarget);
    setDeleting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus unit");
      return;
    }
    toast.success("Unit dihapus");
    setDeleteTarget(null);
    invalidateUnits();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Project</CardTitle>
          <SiteplanProjectFormDialog
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4" /> Tambah Project
              </Button>
            }
            onSaved={invalidateProjects}
          />
        </CardHeader>
        <CardContent>
          {loadingProjects ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : !projects || projects.length === 0 ? (
            <EmptyState icon={Plus} title="Belum ada project siteplan" description="Tambah project pertama untuk mulai mengunggah gambar siteplan dan menempatkan unit." />
          ) : (
            <div className="flex items-center gap-2">
              <Select value={projectId ?? undefined} onValueChange={setProjectId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Pilih project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nama} ({p.kode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projectId && (
                <SiteplanProjectFormDialog
                  trigger={
                    <Button size="sm" variant="ghost">
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                  }
                  initialValues={(() => {
                    const p = projects.find((x) => x.id === projectId);
                    return p ? { id: p.id, kode: p.kode, nama: p.nama, lokasi: p.lokasi ?? "", warna: p.warna ?? "" } : undefined;
                  })()}
                  onSaved={invalidateProjects}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {projectId && (
        <>
          <SiteplanRowEditor projectId={projectId} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Unit</CardTitle>
              <SiteplanUnitFormDialog
                projectId={projectId}
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4" /> Tambah Unit
                  </Button>
                }
                onSaved={invalidateUnits}
              />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {loadingUnits ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : !units || units.length === 0 ? (
                <EmptyState icon={Plus} title="Belum ada unit" description="Tambah unit untuk project ini." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Blok</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead className="text-right">Harga</TableHead>
                        <TableHead className="text-right">Luas</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {units.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.blok}</TableCell>
                          <TableCell>{u.tipe ?? "-"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(u.harga ?? 0)}</TableCell>
                          <TableCell className="text-right tabular-nums">{u.luas ?? "-"}</TableCell>
                          <TableCell>
                            <SiteplanUnitStatusBadge status={u.status as SiteplanUnitStatus} />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <SiteplanUnitFormDialog
                                projectId={projectId}
                                initialValues={{ id: u.id, projectId, blok: u.blok, tipe: u.tipe ?? "", harga: u.harga ?? undefined, luas: u.luas ?? undefined }}
                                trigger={
                                  <Button size="sm" variant="ghost">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                }
                                onSaved={invalidateUnits}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                disabled={u.status !== "tersedia"}
                                title={u.status !== "tersedia" ? "Hanya unit berstatus tersedia yang bisa dihapus" : undefined}
                                onClick={() => setDeleteTarget(u.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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

          <SiteplanFeeQueue />
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus unit ini?"
        description="Unit dan posisi hotspotnya (jika ada) akan dihapus permanen."
        confirmLabel="Hapus"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
