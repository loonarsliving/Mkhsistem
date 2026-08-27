"use client";

import * as React from "react";
import { Copy, Download, Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteKontenAiAsset, useDuplicateKontenAiAsset } from "@/features/kontenai/asset-library/hooks/use-kontenai-asset-mutations";
import type { KontenAiAssetWithCreator } from "@/repositories/kontenai-assets.repository";

interface AssetCardMenuProps {
  asset: KontenAiAssetWithCreator;
  onPreview: () => void;
  onEdit: () => void;
}

export function AssetCardMenu({ asset, onPreview, onEdit }: AssetCardMenuProps) {
  const duplicateMutation = useDuplicateKontenAiAsset();
  const deleteMutation = useDeleteKontenAiAsset();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onPreview}>
            <Eye className="h-4 w-4" />
            Preview
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={asset.public_url ?? undefined} download={asset.filename} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Download
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Rename / Move Folder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => duplicateMutation.mutate(asset.id)} disabled={duplicateMutation.isPending}>
            <Copy className="h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Hapus aset ini?"
        description={`"${asset.title}" akan dihapus dari Asset Library. File di storage tetap tersimpan untuk keperluan audit.`}
        destructive
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(asset.id, { onSuccess: () => setConfirmDeleteOpen(false) })}
      />
    </>
  );
}
