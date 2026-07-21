/**
 * Local types for Sprint 6 - Render Engine.
 *
 * These are additive helpers used only inside this module. The shared
 * contract types (RenderJob, RenderStatus, Storyboard, ...) live in
 * features/kontenai/types.ts and are imported from there instead of
 * being redefined here.
 */

import type { TargetPlatform } from "@/features/kontenai/types";

/**
 * A lightweight summary of a Storyboard (Sprint 4/5 output) that is
 * complete enough to be queued for render. The Storyboard Engine and
 * Asset Selector modules are being built in parallel, so this module
 * seeds its own local mock summaries rather than depending on their
 * in-progress data layer.
 */
export interface StoryboardSummary {
  id: string;
  directiveId: string;
  title: string;
  targetPlatform: TargetPlatform;
  sceneCount: number;
  totalDurationSeconds: number;
  assetsFullySelected: boolean;
}
