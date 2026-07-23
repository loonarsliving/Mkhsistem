/**
 * Local types for the Storyboard Engine (Sprint 4). These only describe
 * client-side editing state layered on top of the shared `Storyboard` /
 * `StoryboardScene` contracts in `features/kontenai/types.ts` -- they are
 * not part of the cross-module contract, so it's safe to change them here
 * without touching the shared file.
 */
import type { SceneTransition } from "@/features/kontenai/types";

/** A scene while it's still being edited in the builder, before persistence. */
export interface EditableScene {
  id: string;
  order: number;
  description: string;
  durationSeconds: number;
  transition: SceneTransition;
  textOverlay: string;
  requiredAssetTags: string[];
  selectedAssetId: string | null;
}

export const SCENE_TRANSITIONS: { value: SceneTransition; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "zoom", label: "Zoom" },
];
