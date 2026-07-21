"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetType } from "@/features/kontenai/types";
import type { UploadAssetInput } from "@/features/kontenai/asset-library/actions/asset-library.actions";
import { ASSET_TYPE_LABEL } from "./asset-type-icon";

const ASSET_TYPES: AssetType[] = ["image", "video", "audio", "logo", "template"];

interface AssetUploadDialogProps {
  onUpload: (input: UploadAssetInput) => Promise<boolean>;
  isSubmitting: boolean;
  error?: string | null;
}

/**
 * Mock upload flow: no real file picker/storage backend (out of scope for
 * this sprint), but the form fields, validation, and resulting
 * `uploadAssetAction` call are real -- this is what wires the previously
 * disabled "Upload Assets" button up.
 */
export function AssetUploadDialog({ onUpload, isSubmitting, error }: AssetUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState("");
  const [type, setType] = useState<AssetType>("image");
  const [tagsInput, setTagsInput] = useState("");
  const [sizeMb, setSizeMb] = useState("1");
  const [durationSeconds, setDurationSeconds] = useState("");

  const needsDuration = type === "video" || type === "audio";

  function resetForm() {
    setFilename("");
    setType("image");
    setTagsInput("");
    setSizeMb("1");
    setDurationSeconds("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sizeBytes = Math.round(Number(sizeMb) * 1024 * 1024);
    const success = await onUpload({
      filename,
      type,
      tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      sizeBytes,
      durationSeconds: needsDuration && durationSeconds ? Number(durationSeconds) : null,
    });
    if (success) setOpen(false);
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
          <Upload className="h-4 w-4" />
          Upload Assets
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Upload Aset</DialogTitle>
            <DialogDescription>
              Simulasi upload -- belum ada storage backend, jadi metadata ini langsung disimpan ke library.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="asset-filename">Nama file</Label>
            <Input
              id="asset-filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="contoh: villa-cariu-hero.jpg"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-type">Tipe</Label>
            <Select value={type} onValueChange={(value) => setType(value as AssetType)}>
              <SelectTrigger id="asset-type">
                <SelectValue placeholder="Tipe aset" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ASSET_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-tags">Tag (pisahkan dengan koma)</Label>
            <Input
              id="asset-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="leasehold_sales, eksterior, golden-hour"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="asset-size">Ukuran (MB)</Label>
              <Input
                id="asset-size"
                type="number"
                min="0.01"
                step="0.01"
                value={sizeMb}
                onChange={(e) => setSizeMb(e.target.value)}
                required
              />
            </div>
            {needsDuration && (
              <div className="space-y-2">
                <Label htmlFor="asset-duration">Durasi (detik)</Label>
                <Input
                  id="asset-duration"
                  type="number"
                  min="0"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(e.target.value)}
                />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Mengunggah..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
