"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

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
import type { AssetRecord } from "@/features/kontenai/types";

interface AssetDeleteButtonProps {
  asset: AssetRecord;
  onConfirm: (assetId: string) => void;
  isSubmitting: boolean;
}

/** Delete button with a confirmation dialog before calling deleteAssetAction. */
export function AssetDeleteButton({ asset, onConfirm, isSubmitting }: AssetDeleteButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          aria-label={`Hapus ${asset.filename}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus Aset?</DialogTitle>
          <DialogDescription className="truncate">
            Aset &ldquo;{asset.filename}&rdquo; akan dihapus permanen dari library. Tindakan ini tidak dapat dibatalkan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting}
            onClick={() => {
              onConfirm(asset.id);
              setOpen(false);
            }}
          >
            {isSubmitting ? "Menghapus..." : "Hapus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
