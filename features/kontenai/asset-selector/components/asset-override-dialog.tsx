"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssetRecord } from "@/features/kontenai/types";
import { AssetThumbnail } from "@/features/kontenai/asset-selector/components/asset-thumbnail";
import { cn } from "@/lib/utils";

interface AssetOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneDescription: string;
  requiredAssetTags: string[];
  assetLibrary: AssetRecord[];
  currentAssetId: string | null;
  onConfirm: (assetId: string) => void;
}

/** Manual override picker for a scene's matched asset -- updates local state only, nothing persists. */
export function AssetOverrideDialog({
  open,
  onOpenChange,
  sceneDescription,
  requiredAssetTags,
  assetLibrary,
  currentAssetId,
  onConfirm,
}: AssetOverrideDialogProps) {
  const [pickedId, setPickedId] = useState<string | null>(currentAssetId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setPickedId(currentAssetId);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ganti Aset untuk Scene Ini</DialogTitle>
          <DialogDescription>{sceneDescription}</DialogDescription>
        </DialogHeader>

        {requiredAssetTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {requiredAssetTags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {assetLibrary.map((asset) => {
            const isPicked = pickedId === asset.id;
            const overlap = asset.tags.filter((t) => requiredAssetTags.includes(t));
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => setPickedId(asset.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors hover:bg-accent",
                  isPicked ? "border-primary bg-accent" : "border-border",
                )}
              >
                <AssetThumbnail type={asset.type} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{asset.filename}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {asset.type}
                    </Badge>
                    {overlap.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={!pickedId}
            onClick={() => {
              if (pickedId) onConfirm(pickedId);
              onOpenChange(false);
            }}
          >
            Gunakan Aset Ini
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
