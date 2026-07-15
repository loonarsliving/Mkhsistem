"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { uploadEntityFile } from "@/lib/supabase/storage";

import { createProjectPhotoAction, deleteProjectPhotoAction, listProjectPhotosAction, listProjectsForPhotoUploadAction } from "../actions/project-photo.actions";

/**
 * Real-photo source for the Ads Specialist AI pipeline: Markom uploads real
 * property photos here, AI only ever picks and places one of these -- it
 * never generates creative images itself.
 */
export function ProjectPhotoGallery({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = React.useState<string>("");
  const [caption, setCaption] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const { data: projects } = useQuery({ queryKey: ["markom-projects-for-photos"], queryFn: listProjectsForPhotoUploadAction });
  const { data: photos, isLoading } = useQuery({ queryKey: ["markom-project-photos"], queryFn: () => listProjectPhotosAction() });

  React.useEffect(() => {
    if (!projectId && projects && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!projectId) {
      toast.error("Pilih project terlebih dahulu");
      return;
    }

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { path, publicUrl } = await uploadEntityFile("project-photos", projectId, file);
        if (!publicUrl) throw new Error("Gagal mendapatkan URL foto");
        const result = await createProjectPhotoAction({ projectId, storagePath: path, publicUrl, caption: caption || undefined });
        if (!result.success) throw new Error(result.error ?? "Gagal menyimpan foto");
      }
      toast.success("Foto berhasil diunggah");
      setCaption("");
      queryClient.invalidateQueries({ queryKey: ["markom-project-photos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah foto");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteProjectPhotoAction(deleteTarget);
    setDeleting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus foto");
      return;
    }
    toast.success("Foto dihapus");
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["markom-project-photos"] });
  }

  const items = photos ?? [];

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-48 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Project</p>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih project" />
                </SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.city ? ` — ${p.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-48 flex-1 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Keterangan (opsional)</p>
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="mis. Tampak depan, kolam renang, dapur..." />
            </div>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || !projectId}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Unggah Foto
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState icon={ImagePlus} title="Belum ada foto" description="Unggah foto asli project (villa/rumah) untuk jadi sumber materi iklan AI." />
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((photo) => (
            <Card key={photo.id} className="overflow-hidden">
              <div className="relative aspect-square bg-muted">
                <Image src={photo.public_url} alt={photo.caption ?? "Foto project"} fill sizes="240px" className="object-cover" unoptimized />
              </div>
              <CardContent className="space-y-1 p-3">
                <p className="truncate text-sm font-medium">{(photo.project as { name?: string } | null)?.name ?? "-"}</p>
                {photo.caption && <p className="truncate text-xs text-muted-foreground">{photo.caption}</p>}
                {canManage && (
                  <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-destructive" onClick={() => setDeleteTarget(photo.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus foto ini?"
        description="Foto tidak akan lagi tersedia sebagai materi iklan AI."
        confirmLabel="Hapus"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
