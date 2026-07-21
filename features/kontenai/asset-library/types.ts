/** Local types for the Asset Library UI (Sprint 1). Not shared with other KontenAI sub-modules. */

import type { AssetType } from "@/features/kontenai/types";

export type AssetLibraryViewMode = "grid" | "list";

export type AssetTypeFilter = AssetType | "all";

export type AssetVisionFilter = "all" | "analyzed" | "not_analyzed";
