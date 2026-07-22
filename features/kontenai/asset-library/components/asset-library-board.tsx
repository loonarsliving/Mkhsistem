"use client";

import * as React from "react";
import { AlertTriangle, FolderOpen, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { AssetEditDialog } from "@/features/kontenai/asset-library/components/asset-edit-dialog";
import { AssetGrid } from "@/features/kontenai/asset-library/components/asset-grid";
import { AssetList } from "@/features/kontenai/asset-library/components/asset-list";
import { AssetLibrarySkeleton } from "@/features/kontenai/asset-library/components/asset-library-skeleton";
import { AssetLibraryStatsTiles } from "@/features/kontenai/asset-library/components/asset-library-stats";
import { AssetLibraryToolbar, type AssetLibraryFilterState } from "@/features/kontenai/asset-library/components/asset-library-toolbar";
import { AssetPreviewDialog } from "@/features/kontenai/asset-library/components/asset-preview-dialog";
import { AssetUploadDialog } from "@/features/kontenai/asset-library/components/asset-upload-dialog";
import { useAssetLibraryStatsQuery, useKontenAiAssetsQuery, useKontenAiFolderFacetsQuery } from "@/features/kontenai/asset-library/hooks/use-kontenai-assets";
import { DEFAULT_PAGE_SIZE, type AssetLibraryViewMode, type SortOption } from "@/features/kontenai/asset-library/types";
import type { KontenAiAssetListFilters, KontenAiAssetStatus, KontenAiAssetType, KontenAiAssetWithCreator } from "@/repositories/kontenai-assets.repository";

const EMPTY_FILTERS: AssetLibraryFilterState = {
  search: "",
  assetType: "",
  status: "",
  company: "",
  project: "",
  campaign: "",
  platform: "",
  contentType: "",
  location: "",
  tag: "",
  dateFrom: "",
  dateTo: "",
};

function sortOptionToRepositoryFilters(sort: SortOption): Pick<KontenAiAssetListFilters, "sortBy" | "sortDir"> {
  switch (sort) {
    case "created_at_asc":
      return { sortBy: "created_at", sortDir: "asc" };
    case "title_asc":
      return { sortBy: "title", sortDir: "asc" };
    case "title_desc":
      return { sortBy: "title", sortDir: "desc" };
    case "file_size_desc":
      return { sortBy: "file_size_bytes", sortDir: "desc" };
    case "file_size_asc":
      return { sortBy: "file_size_bytes", sortDir: "asc" };
    case "created_at_desc":
    default:
      return { sortBy: "created_at", sortDir: "desc" };
  }
}

export function AssetLibraryBoard() {
  const [filters, setFilters] = React.useState<AssetLibraryFilterState>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortOption>("created_at_desc");
  const [viewMode, setViewMode] = React.useState<AssetLibraryViewMode>("grid");
  const [page, setPage] = React.useState(1);
  const [previewAsset, setPreviewAsset] = React.useState<KontenAiAssetWithCreator | null>(null);
  const [editAsset, setEditAsset] = React.useState<KontenAiAssetWithCreator | null>(null);

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timeout);
  }, [filters.search]);

  React.useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.assetType,
    filters.status,
    filters.company,
    filters.project,
    filters.campaign,
    filters.platform,
    filters.contentType,
    filters.location,
    filters.tag,
    filters.dateFrom,
    filters.dateTo,
    sort,
  ]);

  const queryFilters: KontenAiAssetListFilters = {
    search: debouncedSearch || undefined,
    assetType: (filters.assetType || undefined) as KontenAiAssetType | undefined,
    status: (filters.status || undefined) as KontenAiAssetStatus | undefined,
    company: filters.company || undefined,
    project: filters.project || undefined,
    campaign: filters.campaign || undefined,
    platform: filters.platform || undefined,
    contentType: filters.contentType || undefined,
    location: filters.location || undefined,
    tags: filters.tag ? [filters.tag] : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    ...sortOptionToRepositoryFilters(sort),
  };

  const assetsQuery = useKontenAiAssetsQuery(queryFilters);
  const statsQuery = useAssetLibraryStatsQuery();
  const facetsQuery = useKontenAiFolderFacetsQuery();

  const assets = assetsQuery.data?.data ?? [];
  const total = assetsQuery.data?.total ?? 0;
  const hasActiveFilters = Object.values(filters).some((value) => value !== "");

  return (
    <div className="space-y-4">
      {statsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : statsQuery.data ? (
        <AssetLibraryStatsTiles stats={statsQuery.data} />
      ) : null}

      <AssetLibraryToolbar
        filters={filters}
        onFiltersChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        facets={facetsQuery.data}
        sort={sort}
        onSortChange={setSort}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        uploadSlot={<AssetUploadDialog />}
      />

      {assetsQuery.isLoading ? (
        <AssetLibrarySkeleton />
      ) : assetsQuery.isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Gagal memuat aset"
          description={assetsQuery.error instanceof Error ? assetsQuery.error.message : "Terjadi kesalahan saat mengambil data."}
          action={
            <Button variant="outline" size="sm" onClick={() => assetsQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Coba lagi
            </Button>
          }
        />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={hasActiveFilters ? "Tidak ada aset yang cocok" : "Belum ada aset"}
          description={hasActiveFilters ? "Coba ubah kata kunci atau filter yang digunakan." : "Mulai dengan mengunggah aset pertama ke Asset Library."}
        />
      ) : viewMode === "grid" ? (
        <AssetGrid assets={assets} onPreview={setPreviewAsset} onEdit={setEditAsset} />
      ) : (
        <AssetList assets={assets} onPreview={setPreviewAsset} onEdit={setEditAsset} />
      )}

      {!assetsQuery.isLoading && !assetsQuery.isError && total > 0 && (
        <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} onPageChange={setPage} />
      )}

      <AssetPreviewDialog asset={previewAsset} open={previewAsset !== null} onOpenChange={(open) => !open && setPreviewAsset(null)} />
      <AssetEditDialog asset={editAsset} open={editAsset !== null} onOpenChange={(open) => !open && setEditAsset(null)} />
    </div>
  );
}
