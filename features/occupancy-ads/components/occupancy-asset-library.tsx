"use client";

import * as React from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, Film, ImageIcon, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { OCCUPANCY_ASSET_FIXED_TAGS } from "@/lib/occupancy/campaign-rules";
import { OccupancyAssetUploadDialog } from "./occupancy-asset-upload-dialog";
import {
  deleteCreativeAssetAction,
  listCreativeAssetsAction,
  renameCreativeAssetAction,
  updateCreativeAssetStatusAction,
  updateCreativeAssetTagsAction,
} from "../actions/occupancy-ads.actions";

/**
 * draft -> ai_generated -> review -> approved -> ready -> active lifecycle
 * (migration 0269's loonars_creative_assets.status check constraint) --
 * this array is the order the "advance" button walks through; archived is
 * reachable via a separate action, never via "advance". NOTE: the asset
 * lifecycle's post-approved step is 'ready', NOT 'ready_for_meta' -- that
 * name belongs to loonars_occupancy_campaigns.status (migration 0270)
 * only. Using 'ready_for_meta' here previously violated this table's
 * check constraint and made every "advance past approved" action fail.
 */
const LIFECYCLE_ORDER = ["draft", "ai_generated", "review", "approved", "ready", "active"] as const;
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ai_generated: "AI Generated",
  review: "Review",
  approved: "Disetujui",
  ready: "Siap ke Meta",
  active: "Aktif",
  archived: "Arsip",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  draft: "secondary",
  ai_generated: "secondary",
  review: "secondary",
  approved: "default",
  ready: "default",
  active: "success",
  archived: "destructive",
};

function nextLifecycleStatus(status: string): string | null {
  const idx = LIFECYCLE_ORDER.indexOf(status as (typeof LIFECYCLE_ORDER)[number]);
  if (idx === -1 || idx === LIFECYCLE_ORDER.length - 1) return null;
  return LIFECYCLE_ORDER[idx + 1];
}

export function OccupancyAssetLibrary({ canManage, userId }: { canManage: boolean; userId: string }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [busy, setBusy] = React.useState<string | null>(null);

  const { data: assets, isLoading } = useQuery({
    queryKey: ["occupancy-creative-assets"],
    queryFn: () => listCreativeAssetsAction(),
  });

  const filtered = React.useMemo(() => {
    if (!assets) return [];
    if (statusFilter === "all") return assets;
    return assets.filter((a) => a.status === statusFilter);
  }, [assets, statusFilter]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["occupancy-creative-assets"] });
  }

  async function handleAdvance(id: string, current: string) {
    const next = nextLifecycleStatus(current);
    if (!next) return;
    setBusy(id);
    const result = await updateCreativeAssetStatusAction(id, next);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Status diubah ke ${STATUS_LABEL[next] ?? next}`);
    invalidate();
  }

  async function handleArchive(id: string) {
    setBusy(id);
    const result = await updateCreativeAssetStatusAction(id, "archived");
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Aset diarsipkan");
    invalidate();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Hapus aset ini? Aset yang sudah dipakai di campaign tetap tercatat di histori brief.")) return;
    setBusy(id);
    const result = await deleteCreativeAssetAction(id);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Aset dihapus");
    invalidate();
  }

  async function handleRename(id: string, currentName: string) {
    const next = window.prompt("Nama baru untuk aset ini:", currentName);
    if (!next || next.trim() === currentName) return;
    setBusy(id);
    const result = await renameCreativeAssetAction(id, next.trim());
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    invalidate();
  }

  async function handleToggleTag(id: string, currentTags: string[], propertyName: string | null, tag: string) {
    const nextTags = currentTags.includes(tag) ? currentTags.filter((t) => t !== tag) : [...currentTags, tag];
    setBusy(id);
    const result = await updateCreativeAssetTagsAction(id, nextTags, propertyName);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    invalidate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {[...LIFECYCLE_ORDER, "archived"].map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && <OccupancyAssetUploadDialog userId={userId} />}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Memuat aset...</p>}
      {!isLoading && filtered.length === 0 && (
        <EmptyState icon={ImageIcon} title="Belum ada aset" description="Unggah foto/video properti untuk mulai membangun library kreatif campaign." />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((asset) => {
          const next = nextLifecycleStatus(asset.status);
          const tags: string[] = asset.tags ?? [];
          return (
            <Card key={asset.id} className="overflow-hidden">
              <CardHeader className="p-0">
                <div className="relative aspect-video w-full bg-muted">
                  {asset.media_type === "image" ? (
                    <Image src={asset.public_url} alt={asset.filename} fill className="object-cover" unoptimized />
                  ) : (
                    <video src={asset.public_url} className="h-full w-full object-cover" controls preload="metadata" />
                  )}
                  <Badge variant={STATUS_VARIANT[asset.status] ?? "secondary"} className="absolute right-2 top-2">
                    {STATUS_LABEL[asset.status] ?? asset.status}
                  </Badge>
                  <Badge variant="secondary" className="absolute left-2 top-2 gap-1">
                    {asset.media_type === "video" ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                    {asset.media_type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium" title={asset.filename}>
                    {asset.filename}
                  </p>
                  {canManage && (
                    <button onClick={() => handleRename(asset.id, asset.filename)} aria-label="Ganti nama" className="shrink-0 text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {asset.property_name && <p className="text-xs text-muted-foreground">{asset.property_name}</p>}
                <div className="flex flex-wrap gap-1">
                  {OCCUPANCY_ASSET_FIXED_TAGS.filter((tag) => tags.includes(tag) || canManage).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      disabled={!canManage || busy === asset.id}
                      onClick={() => handleToggleTag(asset.id, tags, asset.property_name, tag)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                        tags.includes(tag) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                  {tags
                    .filter((t) => !(OCCUPANCY_ASSET_FIXED_TAGS as readonly string[]).includes(t))
                    .map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[11px]">
                        {tag}
                      </Badge>
                    ))}
                </div>
              </CardContent>
              {canManage && (
                <CardFooter className="flex flex-wrap gap-2 border-t py-2">
                  {next && (
                    <Button size="sm" variant="secondary" disabled={busy === asset.id} onClick={() => handleAdvance(asset.id, asset.status)}>
                      {busy === asset.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                      Setujui ke {STATUS_LABEL[next]}
                    </Button>
                  )}
                  {asset.status !== "archived" && (
                    <Button size="sm" variant="outline" disabled={busy === asset.id} onClick={() => handleArchive(asset.id)}>
                      <Archive className="mr-1 h-3.5 w-3.5" />
                      Arsipkan
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" disabled={busy === asset.id} onClick={() => handleDelete(asset.id)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Hapus
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>
      {!canManage && <p className="text-xs text-muted-foreground">Anda hanya memiliki akses lihat -- tidak bisa mengunggah/mengubah aset.</p>}
    </div>
  );
}
