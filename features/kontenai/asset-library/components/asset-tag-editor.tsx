"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

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
import type { AssetRecord } from "@/features/kontenai/types";

interface AssetTagEditorProps {
  asset: AssetRecord;
  onSave: (assetId: string, tags: string[]) => Promise<boolean>;
  isSubmitting: boolean;
}

/** Small inline tag editor: opens a dialog pre-filled with the asset's current tags, calls updateAssetTagsAction on save. */
export function AssetTagEditor({ asset, onSave, isSubmitting }: AssetTagEditorProps) {
  const [open, setOpen] = useState(false);
  const [tagsInput, setTagsInput] = useState(asset.tags.join(", "));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const success = await onSave(asset.id, tags);
    if (success) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTagsInput(asset.tags.join(", "));
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Edit tag ${asset.filename}`}>
          <Pencil className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
            <DialogDescription className="truncate">{asset.filename}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`tags-${asset.id}`}>Tag (pisahkan dengan koma)</Label>
            <Input
              id={`tags-${asset.id}`}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="villa, cariu, eksterior"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
