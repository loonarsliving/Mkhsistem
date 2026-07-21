"use client";

import { LayoutGrid, List, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssetType } from "@/features/kontenai/types";
import type { AssetLibraryViewMode, AssetTypeFilter, AssetVisionFilter } from "@/features/kontenai/asset-library/types";

import { ASSET_TYPE_LABEL } from "./asset-type-icon";

const ASSET_TYPES: AssetType[] = ["image", "video", "audio", "logo", "template"];

interface AssetLibraryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: AssetTypeFilter;
  onTypeFilterChange: (value: AssetTypeFilter) => void;
  visionFilter: AssetVisionFilter;
  onVisionFilterChange: (value: AssetVisionFilter) => void;
  viewMode: AssetLibraryViewMode;
  onViewModeChange: (value: AssetLibraryViewMode) => void;
}

export function AssetLibraryToolbar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  visionFilter,
  onVisionFilterChange,
  viewMode,
  onViewModeChange,
}: AssetLibraryToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari nama file atau tag..."
            className="pl-9"
            aria-label="Cari aset"
          />
        </div>

        <Select value={typeFilter} onValueChange={(value) => onTypeFilterChange(value as AssetTypeFilter)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Tipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tipe</SelectItem>
            {ASSET_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {ASSET_TYPE_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={visionFilter} onValueChange={(value) => onVisionFilterChange(value as AssetVisionFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status Gemini Vision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status Vision</SelectItem>
            <SelectItem value="analyzed">Sudah Dianalisis</SelectItem>
            <SelectItem value="not_analyzed">Belum Dianalisis</SelectItem>
          </SelectContent>
        </Select>
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

        <Tooltip>
          <TooltipTrigger asChild>
            {/* Real upload needs a storage backend, intentionally out of scope for this sprint. */}
            <span tabIndex={0}>
              <Button type="button" disabled className="pointer-events-none">
                <Upload className="h-4 w-4" />
                Upload Assets
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Tersedia setelah storage backend terhubung</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
