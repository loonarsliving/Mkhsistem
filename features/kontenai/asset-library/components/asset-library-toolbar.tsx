"use client";

import type { ReactNode } from "react";
import { LayoutGrid, List, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetLibraryViewMode, SortOption } from "@/features/kontenai/asset-library/types";
import { ASSET_TYPE_OPTIONS } from "@/features/kontenai/asset-library/utils/asset-type-meta";
import type { KontenAiFolderFacets } from "@/repositories/kontenai-assets.repository";

export interface AssetLibraryFilterState {
  search: string;
  assetType: string;
  status: string;
  company: string;
  project: string;
  campaign: string;
  platform: string;
  contentType: string;
  location: string;
  tag: string;
  dateFrom: string;
  dateTo: string;
}

interface AssetLibraryToolbarProps {
  filters: AssetLibraryFilterState;
  onFiltersChange: (patch: Partial<AssetLibraryFilterState>) => void;
  facets?: KontenAiFolderFacets;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  viewMode: AssetLibraryViewMode;
  onViewModeChange: (value: AssetLibraryViewMode) => void;
  uploadSlot: ReactNode;
}

const ALL = "all";

function FacetSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger className="w-full sm:w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AssetLibraryToolbar({ filters, onFiltersChange, facets, sort, onSortChange, viewMode, onViewModeChange, uploadSlot }: AssetLibraryToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
            placeholder="Cari judul, file, deskripsi..."
            className="pl-9"
            aria-label="Cari aset"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-md border border-input p-0.5">
            <Button
              type="button"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              aria-label="Tampilan grid"
              aria-pressed={viewMode === "grid"}
              onClick={() => onViewModeChange("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              aria-label="Tampilan daftar"
              aria-pressed={viewMode === "list"}
              onClick={() => onViewModeChange("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          {uploadSlot}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={filters.assetType || ALL} onValueChange={(value) => onFiltersChange({ assetType: value === ALL ? "" : value })}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Tipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Tipe</SelectItem>
            {ASSET_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status || ALL} onValueChange={(value) => onFiltersChange({ status: value === ALL ? "" : value })}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <FacetSelect value={filters.company} placeholder="Company" options={facets?.companies ?? []} onChange={(v) => onFiltersChange({ company: v })} />
        <FacetSelect value={filters.project} placeholder="Project" options={facets?.projects ?? []} onChange={(v) => onFiltersChange({ project: v })} />
        <FacetSelect value={filters.campaign} placeholder="Campaign" options={facets?.campaigns ?? []} onChange={(v) => onFiltersChange({ campaign: v })} />
        <FacetSelect value={filters.platform} placeholder="Platform" options={facets?.platforms ?? []} onChange={(v) => onFiltersChange({ platform: v })} />
        <FacetSelect
          value={filters.contentType}
          placeholder="Content Type"
          options={facets?.contentTypes ?? []}
          onChange={(v) => onFiltersChange({ contentType: v })}
        />
        <FacetSelect value={filters.location} placeholder="Location" options={facets?.locations ?? []} onChange={(v) => onFiltersChange({ location: v })} />

        <Input
          value={filters.tag}
          onChange={(e) => onFiltersChange({ tag: e.target.value })}
          placeholder="Tag..."
          className="w-full sm:w-36"
          aria-label="Cari berdasarkan tag"
        />

        <Select value={sort} onValueChange={(value) => onSortChange(value as SortOption)}>
          <SelectTrigger className="w-full sm:ml-auto sm:w-48">
            <SelectValue placeholder="Urutkan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at_desc">Terbaru</SelectItem>
            <SelectItem value="created_at_asc">Terlama</SelectItem>
            <SelectItem value="title_asc">Judul A-Z</SelectItem>
            <SelectItem value="title_desc">Judul Z-A</SelectItem>
            <SelectItem value="file_size_desc">Ukuran Terbesar</SelectItem>
            <SelectItem value="file_size_asc">Ukuran Terkecil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-xs text-muted-foreground">Tanggal dibuat:</span>
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onFiltersChange({ dateFrom: e.target.value })}
          className="w-full sm:w-40"
          aria-label="Dari tanggal"
        />
        <span className="text-xs text-muted-foreground">s/d</span>
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onFiltersChange({ dateTo: e.target.value })}
          className="w-full sm:w-40"
          aria-label="Sampai tanggal"
        />
      </div>
    </div>
  );
}
