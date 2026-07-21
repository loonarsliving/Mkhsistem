"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { AssetRecord } from "@/features/kontenai/types";
import type { AssetLibraryViewMode, AssetTypeFilter, AssetVisionFilter } from "@/features/kontenai/asset-library/types";
import { listAssetsAction } from "@/features/kontenai/asset-library/actions/asset-library.actions";

import { AssetGrid } from "./asset-grid";
import { AssetList } from "./asset-list";
import { AssetLibraryEmptyState } from "./asset-library-empty-state";
import { AssetLibrarySkeleton } from "./asset-library-skeleton";
import { AssetLibraryToolbar } from "./asset-library-toolbar";

function matchesAsset(asset: AssetRecord, search: string, typeFilter: AssetTypeFilter, visionFilter: AssetVisionFilter): boolean {
  if (typeFilter !== "all" && asset.type !== typeFilter) return false;

  if (visionFilter === "analyzed" && !asset.metadata) return false;
  if (visionFilter === "not_analyzed" && asset.metadata) return false;

  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [asset.filename, ...asset.tags].join(" ").toLowerCase();
  return haystack.includes(query);
}

export function AssetLibraryBoard() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetTypeFilter>("all");
  const [visionFilter, setVisionFilter] = useState<AssetVisionFilter>("all");
  const [viewMode, setViewMode] = useState<AssetLibraryViewMode>("grid");

  const { data, isLoading } = useQuery({ queryKey: ["kontenai-asset-library"], queryFn: listAssetsAction });

  const filteredAssets = useMemo(() => {
    if (!data) return [];
    return data.filter((asset) => matchesAsset(asset, search, typeFilter, visionFilter));
  }, [data, search, typeFilter, visionFilter]);

  const hasActiveFilters = search.trim() !== "" || typeFilter !== "all" || visionFilter !== "all";

  return (
    <div className="space-y-4">
      <AssetLibraryToolbar
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        visionFilter={visionFilter}
        onVisionFilterChange={setVisionFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {isLoading ? (
        <AssetLibrarySkeleton />
      ) : filteredAssets.length === 0 ? (
        <AssetLibraryEmptyState hasActiveFilters={hasActiveFilters} />
      ) : viewMode === "grid" ? (
        <AssetGrid assets={filteredAssets} />
      ) : (
        <AssetList assets={filteredAssets} />
      )}

      {!isLoading && data && (
        <p className="text-xs text-muted-foreground">
          Menampilkan {filteredAssets.length} dari {data.length} aset.
        </p>
      )}
    </div>
  );
}
