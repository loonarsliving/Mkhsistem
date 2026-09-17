"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadEntityFile } from "@/lib/supabase/storage";
import { OCCUPANCY_ASSET_FIXED_TAGS } from "@/lib/occupancy/campaign-rules";
import { recordCreativeAssetAction } from "../actions/occupancy-ads.actions";

/**
 * Real file upload (image jpg/jpeg/png/webp, video mp4/mov) to the
 * occupancy-ads-assets bucket (migration 0269), adapted from
 * features/kontenai/asset-library/components/asset-upload-dialog.tsx's
 * pattern: upload to Storage client-side with uploadEntityFile, inspect
 * dimensions in-browser, then record the DB row via a Server Action that
 * never touches Storage itself.
 */
export const OCCUPANCY_ASSETS_BUCKET = "occupancy-ads-assets";
export const MAX_OCCUPANCY_ASSET_SIZE_BYTES = 50 * 1024 * 1024; // matches migration 0269's bucket file_size_limit

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "video/mp4", "video/quicktime"];

function inspectImageOrVideo(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        cleanup();
      };
      img.onerror = () => {
        resolve({ width: null, height: null });
        cleanup();
      };
      img.src = url;
      return;
    }
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth, height: video.videoHeight });
        cleanup();
      };
      video.onerror = () => {
        resolve({ width: null, height: null });
        cleanup();
      };
      video.src = url;
      return;
    }
    resolve({ width: null, height: null });
    cleanup();
  });
}

export function OccupancyAssetUploadDialog({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [propertyName, setPropertyName] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  function resetForm() {
    setFile(null);
    setPropertyName("");
    setTags([]);
    setCustomTagInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function addCustomTag() {
    const value = customTagInput.trim();
    if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
    setCustomTagInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      const mediaType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      const [{ path, publicUrl }, dims] = await Promise.all([
        uploadEntityFile(OCCUPANCY_ASSETS_BUCKET, userId, file, MAX_OCCUPANCY_ASSET_SIZE_BYTES),
        inspectImageOrVideo(file),
      ]);
      if (!publicUrl) throw new Error("Gagal mendapatkan URL publik aset");

      const result = await recordCreativeAssetAction({
        filename: file.name,
        propertyName: propertyName.trim() || null,
        tags,
        mediaType,
        widthPx: dims.width,
        heightPx: dims.height,
        sizeBytes: file.size,
        storagePath: path,
        publicUrl,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Aset berhasil diunggah");
      queryClient.invalidateQueries({ queryKey: ["occupancy-creative-assets"] });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah aset");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <UploadCloud className="h-4 w-4" />
          Unggah Aset
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Unggah Aset Kreatif</DialogTitle>
            <DialogDescription>Foto (jpg/jpeg/png/webp) atau video (mp4/mov), maks {Math.round(MAX_OCCUPANCY_ASSET_SIZE_BYTES / (1024 * 1024))}MB -- tersimpan di Supabase Storage.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="occupancy-asset-file">File</Label>
            <Input
              id="occupancy-asset-file"
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                if (selected && !ACCEPTED_TYPES.includes(selected.type)) {
                  toast.error("Tipe file tidak didukung -- hanya jpg/jpeg/png/webp atau mp4/mov");
                  e.target.value = "";
                  setFile(null);
                  return;
                }
                setFile(selected);
              }}
              required
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} -- {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="occupancy-asset-property">Properti</Label>
            <Input id="occupancy-asset-property" value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="Loonars Private Living..." />
          </div>

          <div className="space-y-2">
            <Label>Tag</Label>
            <div className="flex flex-wrap gap-1.5">
              {OCCUPANCY_ASSET_FIXED_TAGS.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${tags.includes(tag) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                placeholder="Tag custom, lalu Enter"
              />
              <Button type="button" variant="outline" onClick={addCustomTag}>
                Tambah
              </Button>
            </div>
            {tags.filter((t) => !(OCCUPANCY_ASSET_FIXED_TAGS as readonly string[]).includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags
                  .filter((t) => !(OCCUPANCY_ASSET_FIXED_TAGS as readonly string[]).includes(t))
                  .map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button type="button" onClick={() => setTags((prev) => prev.filter((t) => t !== tag))} aria-label={`Hapus tag ${tag}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={uploading || !file}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unggah
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
