/**
 * Local types for the Asset Library UI (Sprint 1). Deliberately NOT shared
 * with features/kontenai/types.ts (the mock contract Sprints 2-9 build
 * against) -- Asset Library is now backed by a real kontenai_assets table
 * (see repositories/kontenai-assets.repository.ts), while the other
 * sprints remain fully mocked this round. Keeping them decoupled means
 * connecting a later sprint for real is an additive change here, not a
 * breaking one to already-shipped mock modules.
 */

export type AssetLibraryViewMode = "grid" | "list";

export type SortOption = "created_at_desc" | "created_at_asc" | "title_asc" | "title_desc" | "file_size_desc" | "file_size_asc";

export const DEFAULT_PAGE_SIZE = 24;
