import type { ContentBrief, PipelineRun, PipelineStage } from "@/features/kontenai/types";

/**
 * Local view type for Sprint 7 (Production Pipeline). Sprint 7 is the
 * module that ties every other KontenAI sprint together end-to-end, so
 * its UI needs the ContentBrief alongside the PipelineRun for display --
 * denormalized here instead of editing the shared types.ts contract.
 */
export interface PipelineRunView extends PipelineRun {
  brief: ContentBrief;
}

/** Canonical stage order, used for the stepper UI and stage-distribution tiles. */
export const STAGE_SEQUENCE: PipelineStage[] = [
  "brief",
  "directive",
  "storyboard",
  "asset_selection",
  "render",
  "studio_review",
  "revision",
  "published",
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  brief: "Brief",
  directive: "AI Directive",
  storyboard: "Storyboard",
  asset_selection: "Pemilihan Aset",
  render: "Render",
  studio_review: "Studio Review",
  revision: "Revisi",
  published: "Published",
};
