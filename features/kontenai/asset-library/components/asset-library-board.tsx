"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import type { AssetRecord } from "@/features/kontenai/types";
import type { AssetLibraryViewMode, AssetTypeFilter, AssetVisionFilter } from "@/features/kontenai/asset-library/types";
import {
  deleteAssetAction,
  getAssetLibraryStatsAction,
  listAssetsAction,
  updateAssetTagsAction,
  uploadAssetAction,
  type UploadAssetInput,
} from "@/features/kontenai/asset-library/actions/asset-library.actions";

import { AssetGrid } from "./asset-grid";
import { AssetList } from "./asset-list";
import { AssetLibraryEmptyState } from "./asset-library-empty-state";
import { AssetLibrarySkeleton } from "./asset-library-skeleton";
import { AssetLibraryStatsTiles } from "./asset-library-stats";
import { AssetLibraryToolbar } from "./asset-library-toolbar";
import { AssetUploadDialog } from "./asset-upload-dialog";

const ASSETS_QUERY_KEY = ["kontenai-asset-library"];
const STATS_QUERY_KEY = ["kontenai-asset-library-stats"];

function matchesAsset(asset: AssetRecord, search: string, typeFilter: AssetTypeFilter, visionFilter: AssetVisionFilter): boolean {
  if (typeFilter !== "all" && asset.type !== typeFilter) return false;

  if (visionFilter === "analyzed" && !asset.metadata) return false;
  if (visionFilter === "not_analyzed" && asset.metadata) return false;

  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    asset.filename,
    ...asset.tags,
    asset.metadata?.description ?? "",
    ...(asset.metadata?.suggestedUseCases ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function AssetLibraryBoard() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetTypeFilter>("all");
  const [visionFilter, setVisionFilter] = useState<AssetVisionFilter>("all");
  const [viewMode, setViewMode] = useState<AssetLibraryViewMode>("grid");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mutatingAssetId, setMutatingAssetId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ASSETS_QUERY_KEY, queryFn: () => listAssetsAction() });
  const { data: stats, isLoading: isStatsLoading } = useQuery({ queryKey: STATS_QUERY_KEY, queryFn: getAssetLibraryStatsAction });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ASSETS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: STATS_QUERY_KEY });
  }

  const uploadMutation = useMutation({
    mutationFn: (input: UploadAssetInput) => uploadAssetAction(input),
  });

  const tagsMutation = useMutation({
    mutationFn: ({ assetId, tags }: { assetId: string; tags: string[] }) => updateAssetTagsAction(assetId, tags),
  });

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => deleteAssetAction(assetId),
  });

  async function handleUpload(input: UploadAssetInput): Promise<boolean> {
    setUploadError(null);
    const result = await uploadMutation.mutateAsync(input);
    if (!result.success) {
      setUploadError(result.error ?? "Gagal mengunggah aset");
      return false;
    }
    invalidateAll();
    return true;
  }

  async function handleUpdateTags(assetId: string, tags: string[]): Promise<boolean> {
    setMutatingAssetId(assetId);
    try {
      const result = await tagsMutation.mutateAsync({ assetId, tags });
      if (!result.success) return false;
      invalidateAll();
      return true;
    } finally {
      setMutatingAssetId(null);
    }
  }

  async function handleDelete(assetId: string) {
    setMutatingAssetId(assetId);
    try {
      await deleteMutation.mutateAsync(assetId);
      invalidateAll();
    } finally {
      setMutatingAssetId(null);
    }
  }

  const filteredAssets = useMemo(() => {
    if (!data) return [];
    return data.filter((asset) => matchesAsset(asset, search, typeFilter, visionFilter));
  }, [data, search, typeFilter, visionFilter]);

  const hasActiveFilters = search.trim() !== "" || typeFilter !== "all" || visionFilter !== "all";

  return (
    <div className="space-y-4">
      {isStatsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : stats ? (
        <AssetLibraryStatsTiles stats={stats} />
      ) : null}

      <AssetLibraryToolbar
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        visionFilter={visionFilter}
        onVisionFilterChange={setVisionFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        uploadSlot={
          <AssetUploadDialog onUpload={handleUpload} isSubmitting={uploadMutation.isPending} error={uploadError} />
        }
      />

      {isLoading ? (
        <AssetLibrarySkeleton />
      ) : filteredAssets.length === 0 ? (
        <AssetLibraryEmptyState hasActiveFilters={hasActiveFilters} />
      ) : viewMode === "grid" ? (
        <AssetGrid
          assets={filteredAssets}
          onUpdateTags={handleUpdateTags}
          onDelete={handleDelete}
          mutatingAssetId={mutatingAssetId}
        />
      ) : (
        <AssetList
          assets={filteredAssets}
          onUpdateTags={handleUpdateTags}
          onDelete={handleDelete}
          mutatingAssetId={mutatingAssetId}
        />
      )}

      {!isLoading && data && (
        <p className="text-xs text-muted-foreground">
          Menampilkan {filteredAssets.length} dari {data.length} aset.
        </p>
      )}
    </div>
  );
}
