"use client";

import { useQuery } from "@tanstack/react-query";

import { getAssetLibraryStatsAction, getKontenAiFolderFacetsAction, listKontenAiAssetsAction } from "@/features/kontenai/asset-library/actions/asset-library.actions";
import type { KontenAiAssetListFilters } from "@/repositories/kontenai-assets.repository";

export function useKontenAiAssetsQuery(filters: KontenAiAssetListFilters) {
  return useQuery({
    queryKey: ["kontenai-assets", filters],
    queryFn: () => listKontenAiAssetsAction(filters),
    placeholderData: (previous) => previous,
  });
}

export function useAssetLibraryStatsQuery() {
  return useQuery({
    queryKey: ["kontenai-asset-library-stats"],
    queryFn: () => getAssetLibraryStatsAction(),
  });
}

export function useKontenAiFolderFacetsQuery() {
  return useQuery({
    queryKey: ["kontenai-folder-facets"],
    queryFn: () => getKontenAiFolderFacetsAction(),
  });
}
