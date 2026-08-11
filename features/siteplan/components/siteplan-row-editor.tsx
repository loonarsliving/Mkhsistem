"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { assignSiteplanUnitToRowAction, deleteSiteplanRowAction, getSiteplanEditorDataAction, saveSiteplanRowOrderingAction } from "../actions/siteplan.actions";

const UNGROUPED_LABEL = "Belum dikelompokkan";

interface SiteplanRowEditorProps {
  projectId: string;
}

/**
 * Admin row/order editor for the grid siteplan viewer (replaces the image+hotspot position editor --
 * there's no background image to click/drag against anymore). Each named row (e.g. "Atas"/"Bawah") is
 * edited as a comma-separated, left-to-right ordered list of blok codes -- the same simple text-list UX
 * the original loonars-sales admin used, since a real drag-list primitive wasn't already available here
 * to reuse cheaply. Units with no row_label sit in an "Belum dikelompokkan" bucket and can be assigned
 * into an existing row with a one-click dropdown, without needing to retype the whole row's list.
 */
export function SiteplanRowEditor({ projectId }: SiteplanRowEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["siteplan-editor", projectId];
  const { data, isLoading } = useQuery({ queryKey, queryFn: () => getSiteplanEditorDataAction(projectId) });

  const [rowDrafts, setRowDrafts] = React.useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [newRowName, setNewRowName] = React.useState("");
  const [newRowCodes, setNewRowCodes] = React.useState("");
  const [creatingRow, setCreatingRow] = React.useState(false);
  const [assigningUnitId, setAssigningUnitId] = React.useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
  }

  const units = React.useMemo(() => data?.units ?? [], [data?.units]);

  const rows = React.useMemo(() => {
    const map = new Map<string, { id: string; blok: string }[]>();
    for (const u of units) {
      if (!u.row_label) continue;
      const list = map.get(u.row_label);
      if (list) list.push({ id: u.id, blok: u.blok });
      else map.set(u.row_label, [{ id: u.id, blok: u.blok }]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [units]);

  const ungrouped = units.filter((u) => !u.row_label);

  function draftFor(rowLabel: string, currentBlokOrder: string[]) {
    return rowDrafts[rowLabel] ?? currentBlokOrder.join(", ");
  }

  async function handleSaveRow(rowLabel: string, csv: string) {
    const codes = csv
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length === 0) {
      toast.error("Masukkan minimal satu kode unit");
      return;
    }
    setSavingRow(rowLabel);
    const result = await saveSiteplanRowOrderingAction(projectId, rowLabel, codes);
    setSavingRow(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan urutan baris");
      return;
    }
    toast.success(`Baris "${rowLabel}" berhasil disimpan`);
    setRowDrafts((prev) => {
      const next = { ...prev };
      delete next[rowLabel];
      return next;
    });
    invalidate();
  }

  async function handleCreateRow() {
    const name = newRowName.trim();
    const codes = newRowCodes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (!name) {
      toast.error("Nama baris tidak boleh kosong");
      return;
    }
    if (codes.length === 0) {
      toast.error("Masukkan minimal satu kode unit");
      return;
    }
    setCreatingRow(true);
    const result = await saveSiteplanRowOrderingAction(projectId, name, codes);
    setCreatingRow(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat baris");
      return;
    }
    toast.success(`Baris "${name}" berhasil dibuat`);
    setNewRowName("");
    setNewRowCodes("");
    invalidate();
  }

  async function handleDeleteRow() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteSiteplanRowAction(projectId, deleteTarget);
    setDeleting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus baris");
      return;
    }
    toast.success(`Baris "${deleteTarget}" dihapus, unit dipindahkan ke ${UNGROUPED_LABEL}`);
    setDeleteTarget(null);
    invalidate();
  }

  async function handleAssignToRow(unitId: string, rowLabel: string) {
    setAssigningUnitId(unitId);
    const result = await assignSiteplanUnitToRowAction(unitId, rowLabel);
    setAssigningUnitId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memindahkan unit");
      return;
    }
    toast.success("Unit dipindahkan");
    invalidate();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Urutan Baris Siteplan</CardTitle>
          <p className="text-xs text-muted-foreground">
            Tiap baris ditampilkan sebagai grup kotak unit di halaman siteplan (mis. &quot;Atas&quot;, &quot;Bawah&quot;). Masukkan kode
            unit (blok) dipisah koma, sesuai urutan tampil dari kiri ke kanan.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Belum ada baris. Buat baris pertama di bawah.</p>}
          {rows.map(([rowLabel, rowUnits]) => {
            const currentOrder = rowUnits.map((u) => u.blok);
            const value = draftFor(rowLabel, currentOrder);
            return (
              <div key={rowLabel} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{rowLabel}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleteTarget(rowLabel)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={value}
                    onChange={(e) => setRowDrafts((prev) => ({ ...prev, [rowLabel]: e.target.value }))}
                    placeholder="C1, C2, C3, ..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSaveRow(rowLabel, value)}
                    disabled={savingRow === rowLabel}
                  >
                    {savingRow === rowLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Simpan
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="space-y-2 rounded-md border border-dashed p-3">
            <p className="text-sm font-semibold">Tambah Baris Baru</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={newRowName} onChange={(e) => setNewRowName(e.target.value)} placeholder="Nama baris, mis. Atas" className="sm:w-48" />
              <Input value={newRowCodes} onChange={(e) => setNewRowCodes(e.target.value)} placeholder="Kode unit, mis. C1, C2, C3" className="flex-1" />
              <Button type="button" size="sm" variant="outline" onClick={handleCreateRow} disabled={creatingRow}>
                {creatingRow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Tambah Baris
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{UNGROUPED_LABEL}</CardTitle>
          <p className="text-xs text-muted-foreground">Unit baru yang belum dimasukkan ke baris manapun. Pilih baris tujuan untuk memindahkannya.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {ungrouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">Semua unit sudah dikelompokkan.</p>
          ) : (
            ungrouped.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{unit.blok}</p>
                  <p className="text-xs text-muted-foreground">{unit.tipe ?? "-"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`assign-${unit.id}`} className="sr-only">
                    Pindahkan ke baris
                  </Label>
                  <Select
                    disabled={rows.length === 0 || assigningUnitId === unit.id}
                    onValueChange={(rowLabel) => handleAssignToRow(unit.id, rowLabel)}
                  >
                    <SelectTrigger id={`assign-${unit.id}`} className="w-40">
                      <SelectValue placeholder="Pindah ke baris..." />
                    </SelectTrigger>
                    <SelectContent>
                      {rows.map(([rowLabel]) => (
                        <SelectItem key={rowLabel} value={rowLabel}>
                          {rowLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assigningUnitId === unit.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Hapus baris "${deleteTarget}"?`}
        description={`Unit di baris ini akan dipindahkan ke "${UNGROUPED_LABEL}", bukan dihapus.`}
        confirmLabel="Hapus Baris"
        destructive
        loading={deleting}
        onConfirm={handleDeleteRow}
      />
    </div>
  );
}
