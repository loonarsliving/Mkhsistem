"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, MapPin, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { STORAGE_BUCKETS } from "@/constants/app";
import { uploadEntityFile } from "@/lib/supabase/storage";
import { cn } from "@/lib/utils";

import { getSiteplanEditorDataAction, saveSiteplanImageAction, upsertUnitPositionAction } from "../actions/siteplan.actions";

interface SiteplanPositionEditorProps {
  projectId: string;
}

interface PendingPosition {
  xPct: number;
  yPct: number;
}

function readNaturalSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal membaca gambar"));
    };
    img.src = url;
  });
}

export function SiteplanPositionEditor({ projectId }: SiteplanPositionEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["siteplan-editor", projectId];
  const { data, isLoading } = useQuery({ queryKey, queryFn: () => getSiteplanEditorDataAction(projectId) });

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageContainerRef = React.useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [selectedUnplacedId, setSelectedUnplacedId] = React.useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Record<string, PendingPosition>>({});

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const { width, height } = await readNaturalSize(file);
      const { path } = await uploadEntityFile(STORAGE_BUCKETS.SITEPLAN_IMAGES, projectId, file);
      const result = await saveSiteplanImageAction(projectId, path, width, height);
      if (!result.success) {
        toast.error(result.error ?? "Gagal menyimpan gambar siteplan");
        return;
      }
      toast.success("Gambar siteplan berhasil diperbarui");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah gambar");
    } finally {
      setUploading(false);
    }
  }

  function pctFromPointer(clientX: number, clientY: number): PendingPosition | null {
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const xPct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    return { xPct: Math.round(xPct * 100) / 100, yPct: Math.round(yPct * 100) / 100 };
  }

  function handleImageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!selectedUnplacedId) return;
    const pos = pctFromPointer(event.clientX, event.clientY);
    if (!pos) return;
    setPending((prev) => ({ ...prev, [selectedUnplacedId]: pos }));
    setSelectedUnplacedId(null);
  }

  function handleMarkerPointerDown(unitId: string, event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingUnitId(unitId);
  }

  function handleMarkerPointerMove(unitId: string, event: React.PointerEvent<HTMLButtonElement>) {
    if (draggingUnitId !== unitId) return;
    const pos = pctFromPointer(event.clientX, event.clientY);
    if (!pos) return;
    setPending((prev) => ({ ...prev, [unitId]: pos }));
  }

  function handleMarkerPointerUp() {
    setDraggingUnitId(null);
  }

  async function handleSavePositions() {
    const entries = Object.entries(pending);
    if (entries.length === 0) {
      toast.info("Tidak ada perubahan posisi untuk disimpan");
      return;
    }
    setSaving(true);
    try {
      for (const [unitId, pos] of entries) {
        const result = await upsertUnitPositionAction(unitId, pos.xPct, pos.yPct);
        if (!result.success) {
          toast.error(`Gagal menyimpan posisi unit: ${result.error ?? "unknown error"}`);
          return;
        }
      }
      toast.success(`${entries.length} posisi unit berhasil disimpan`);
      setPending({});
      invalidate();
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const image = data?.image;
  const positions = data?.positions ?? [];
  const unpositioned = data?.unpositioned ?? [];
  const units = data?.units ?? [];
  const unitById = new Map(units.map((u) => [u.id, u]));

  // Merge server-known positions with any not-yet-saved local edits, so drags/placements render immediately.
  const markerEntries = new Map<string, PendingPosition>();
  for (const p of positions) markerEntries.set(p.unit_id, { xPct: Number(p.x_pct), yPct: Number(p.y_pct) });
  for (const [unitId, pos] of Object.entries(pending)) markerEntries.set(unitId, pos);

  const stillUnplaced = unpositioned.filter((u) => !pending[u.id]);
  const dirtyCount = Object.keys(pending).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Gambar Siteplan</CardTitle>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} />
            <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {image ? "Ganti Gambar" : "Unggah Gambar"}
            </Button>
            <Button type="button" size="sm" onClick={handleSavePositions} disabled={saving || dirtyCount === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan Posisi{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!image?.imageUrl ? (
            <EmptyState icon={MapPin} title="Belum ada gambar siteplan" description="Unggah gambar siteplan (PNG/JPG/WebP) untuk mulai menempatkan hotspot unit." />
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                {selectedUnplacedId
                  ? "Klik posisi pada gambar untuk menempatkan unit terpilih."
                  : "Klik unit di daftar kanan lalu klik posisinya pada gambar, atau seret marker yang sudah ada."}
              </p>
              <div
                ref={imageContainerRef}
                onClick={handleImageClick}
                className={cn(
                  "relative mx-auto w-full max-w-4xl overflow-hidden rounded-md border bg-muted",
                  selectedUnplacedId && "cursor-crosshair",
                )}
                style={{ aspectRatio: image.image_width && image.image_height ? image.image_width / image.image_height : 16 / 9 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.imageUrl} alt="Siteplan" className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain" />
                {Array.from(markerEntries.entries()).map(([unitId, pos]) => {
                  const unit = unitById.get(unitId);
                  return (
                    <button
                      key={unitId}
                      type="button"
                      onPointerDown={(e) => handleMarkerPointerDown(unitId, e)}
                      onPointerMove={(e) => handleMarkerPointerMove(unitId, e)}
                      onPointerUp={handleMarkerPointerUp}
                      className={cn(
                        "absolute flex h-8 min-w-[2rem] -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white px-1.5 text-[11px] font-bold leading-none shadow-md active:cursor-grabbing",
                        pending[unitId] ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2" : "bg-secondary text-secondary-foreground",
                      )}
                      style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
                      title={unit?.blok ?? unitId}
                    >
                      {unit?.blok ?? "?"}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unit Belum Ditempatkan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stillUnplaced.length === 0 ? (
            <p className="text-sm text-muted-foreground">Semua unit sudah punya posisi.</p>
          ) : (
            stillUnplaced.map((unit) => (
              <button
                key={unit.id}
                type="button"
                onClick={() => setSelectedUnplacedId(unit.id === selectedUnplacedId ? null : unit.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  selectedUnplacedId === unit.id && "border-primary bg-primary/10",
                )}
              >
                <span className="font-medium">{unit.blok}</span>
                <span className="text-xs text-muted-foreground">{unit.tipe ?? "-"}</span>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
