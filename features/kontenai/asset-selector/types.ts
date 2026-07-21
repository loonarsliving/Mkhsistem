/**
 * Local types for the Asset Selector UI (Sprint 5). Kept separate from
 * the shared `features/kontenai/types.ts` contracts so this module never
 * needs to touch that file.
 */

/** Local, in-memory override of an AssetSelection's chosen asset -- UI-only, not persisted. */
export interface SelectionOverride {
  sceneId: string;
  assetId: string;
}
