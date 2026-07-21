/**
 * Shared data contracts for the KontenAI production pipeline (Sprint 1-9).
 * This file is the single source of truth every KontenAI module builds
 * against. Modules should treat it as read-only and add local types in
 * their own folder instead of editing this file, to avoid cross-module
 * conflicts while sprints are developed in parallel.
 *
 * Pipeline position: Research -> Content Audit -> Content Planner ->
 * KontenAI -> Content Studio -> Publishing -> Analytics -> Learning.
 * KontenAI turns a Content Planner brief into a ready-to-publish asset,
 * then hands it to Content Studio for scoring; a "needs_revision"
 * verdict routes back into KontenAI for another pass.
 */

export type ContentFocus = "general" | "leasehold_sales" | "occupancy" | "beauty";

export type TargetPlatform = "instagram" | "tiktok";

export type AssetType = "image" | "video" | "audio" | "logo" | "template";

export type StudioVerdict = "approved" | "needs_revision";

/** Mirrors the Content Audit weekly evaluation scores (content-audit-board.tsx). */
export interface ContentAuditScores {
  hook: number;
  value: number;
  cta: number;
  nicheFit: number;
  engagementPotential: number;
  platformOptimization: number;
  overall: number;
}

/**
 * Input brief for a KontenAI production run, derived from a Content
 * Planner task (kpi_tasks) enriched with the latest Content Audit
 * insight. This is what Sprint 3 (AI Director) consumes.
 */
export interface ContentBrief {
  id: string;
  kpiTaskId: string;
  title: string;
  description: string | null;
  contentFocus: ContentFocus;
  targetPlatform: TargetPlatform;
  branchId: string;
  divisionId: string;
  dueDate: string | null;
  auditInsight: {
    narrative: string;
    scores: ContentAuditScores;
    growthSignal: "excellent" | "on_track" | "below_benchmark";
    recommendations: string[];
  } | null;
}

/** Sprint 1 - Asset Library entity. */
export interface AssetRecord {
  id: string;
  type: AssetType;
  filename: string;
  url: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  durationSeconds: number | null;
  tags: string[];
  uploadedAt: string;
  uploadedBy: string;
  metadata: AssetVisionMetadata | null;
}

/** Sprint 2 - Gemini Vision output attached to an AssetRecord. */
export interface AssetVisionMetadata {
  assetId: string;
  description: string;
  detectedObjects: string[];
  dominantColors: string[];
  qualityScore: number;
  suggestedUseCases: string[];
  analyzedAt: string;
}

/** Sprint 3 - AI Director output, derived from a ContentBrief. */
export interface ProductionDirective {
  id: string;
  contentBriefId: string;
  narrativeAngle: string;
  keyMessages: string[];
  visualStyle: string;
  recommendedAssetTags: string[];
  callToAction: string;
  targetPlatform: TargetPlatform;
  createdAt: string;
}

export type SceneTransition = "cut" | "fade" | "slide" | "zoom";

export interface StoryboardScene {
  id: string;
  order: number;
  description: string;
  durationSeconds: number;
  transition: SceneTransition;
  textOverlay: string | null;
  requiredAssetTags: string[];
  selectedAssetId: string | null;
}

/** Sprint 4 - Storyboard Engine output, derived from a ProductionDirective. */
export interface Storyboard {
  id: string;
  directiveId: string;
  scenes: StoryboardScene[];
  totalDurationSeconds: number;
  createdAt: string;
}

/** Sprint 5 - Asset Selector output, one per scene. */
export interface AssetSelection {
  storyboardId: string;
  sceneId: string;
  assetId: string;
  matchScore: number;
  rationale: string;
}

export type RenderStatus = "queued" | "rendering" | "completed" | "failed";

/** Sprint 6 - Render Engine job. */
export interface RenderJob {
  id: string;
  storyboardId: string;
  status: RenderStatus;
  progress: number;
  outputUrl: string | null;
  renderSettings: { resolution: string; format: "mp4" | "mov"; fps: number };
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export type PipelineStage =
  | "brief"
  | "directive"
  | "storyboard"
  | "asset_selection"
  | "render"
  | "studio_review"
  | "revision"
  | "published";

export type PipelineRunStatus = "in_progress" | "awaiting_revision" | "approved" | "failed";

/**
 * Sprint 7 - Production Pipeline run. Ties every stage together and
 * carries the feedback loop with Content Studio: when
 * contentStudioVerdict is "needs_revision", the run moves back to an
 * earlier stage (revisionCount increments) instead of ending.
 */
export interface PipelineRun {
  id: string;
  contentBriefId: string;
  currentStage: PipelineStage;
  status: PipelineRunStatus;
  revisionCount: number;
  directiveId: string | null;
  storyboardId: string | null;
  renderJobId: string | null;
  contentStudioScore: number | null;
  contentStudioVerdict: StudioVerdict | null;
  history: { stage: PipelineStage; at: string; note?: string }[];
}

/** Sprint 8 - Learning Engine record, one per finished pipeline run. */
export interface LearningRecord {
  id: string;
  pipelineRunId: string;
  finalScore: number | null;
  verdict: StudioVerdict | null;
  whatWorked: string[];
  whatToImprove: string[];
  createdAt: string;
}

export type OptimizationArea = "ai_director" | "storyboard" | "asset_selection" | "render";

/** Sprint 9 - AI Optimization recommendation, derived from Learning + Analytics. */
export interface OptimizationRecommendation {
  id: string;
  area: OptimizationArea;
  recommendation: string;
  expectedImpact: string;
  confidence: number;
  status: "proposed" | "applied" | "dismissed";
  basedOnRunIds: string[];
  createdAt: string;
}
