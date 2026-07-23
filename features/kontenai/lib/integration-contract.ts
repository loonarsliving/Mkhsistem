/**
 * Cross-sprint integration contract for KontenAI.
 *
 * This file declares (does not implement) the exact server-action
 * signatures each sprint module exposes for OTHER sprints to call
 * directly, so Production Pipeline (Sprint 7) can orchestrate the real
 * functions instead of re-mocking them. Every sprint agent building in
 * parallel reads this same file to agree on names/signatures without
 * needing to see each other's in-progress code.
 *
 * Existing, already-shipped action signatures (do not rename/remove --
 * only extend internals or add new exports):
 *
 *   ai-director/actions/ai-director.actions.ts
 *     listContentBriefsAction(): Promise<ContentBrief[]>
 *     generateDirectiveAction(contentBriefId: string): Promise<ProductionDirective>
 *
 *   storyboard-engine/actions/storyboard-engine.actions.ts
 *     listDirectivesAction(): Promise<ProductionDirective[]>
 *     generateStoryboardAction(directiveId: string): Promise<Storyboard>
 *
 *   asset-selector/actions/asset-selector.actions.ts
 *     listStoryboardsAction(): Promise<Storyboard[]>
 *     listAssetLibraryAction(): Promise<AssetRecord[]>
 *     selectAssetsForStoryboardAction(storyboardId: string): Promise<AssetSelection[]>
 *
 *   render-engine/actions/render-engine.actions.ts
 *     listStoryboardsReadyToRenderAction(): Promise<StoryboardSummary[]>
 *     listRenderJobsAction(): Promise<RenderJob[]>
 *     submitRenderJobAction(storyboardId: string): Promise<RenderJob>
 *
 *   asset-library/actions/asset-library.actions.ts
 *     listAssetsAction(): Promise<AssetRecord[]>
 *
 *   gemini-vision/actions/gemini-vision.actions.ts
 *     listAssetsForAnalysisAction(): Promise<AssetRecord[]>
 *     analyzeAssetAction(assetId: string): Promise<AssetVisionMetadata>
 *
 *   learning-engine/actions/learning-engine.actions.ts
 *     listLearningRecordsAction(): Promise<LearningRecord[]>
 *     getLearningSummaryAction(): Promise<LearningSummary>
 *
 *   ai-optimization/actions/ai-optimization.actions.ts
 *     listRecommendationsAction(): Promise<OptimizationRecommendation[]>
 *     updateRecommendationStatusAction(id: string, status: "applied" | "dismissed"): Promise<OptimizationRecommendation>
 *
 *   production-pipeline/actions/production-pipeline.actions.ts
 *     listPipelineRunsAction(): Promise<PipelineRunView[]>
 *     advanceRunAction(runId: string): Promise<ActionResult<PipelineRunView>>
 *     submitStudioVerdictAction(runId: string, score: number, verdict: StudioVerdict): Promise<ActionResult<PipelineRunView>>
 *
 * NEW exports this round adds to the contract (implement exactly these
 * names/signatures so cross-sprint callers compile):
 *
 *   asset-library/actions/asset-library.actions.ts
 *     uploadAssetAction(input: { filename: string; type: AssetType; tags: string[]; sizeBytes: number; durationSeconds: number | null }): Promise<ActionResult<AssetRecord>>
 *     updateAssetTagsAction(assetId: string, tags: string[]): Promise<ActionResult<AssetRecord>>
 *     deleteAssetAction(assetId: string): Promise<ActionResult<undefined>>
 *
 *   learning-engine/actions/learning-engine.actions.ts
 *     recordLearningOutcomeAction(input: {
 *       pipelineRunId: string;
 *       finalScore: number | null;
 *       verdict: StudioVerdict | null;
 *     }): Promise<LearningRecord>
 *       -- derives whatWorked/whatToImprove itself (e.g. from score bands);
 *          appends to the shared mock-db learningRecords collection and
 *          returns the created record. Called by Production Pipeline when
 *          a run reaches "approved" or gets a revision verdict.
 *
 * Sprint 7 (Production Pipeline) is the only module expected to import
 * and call other sprints' action functions directly (all of the above
 * are plain async functions, safe to call server-side from another
 * server action module). Sprints 1-6, 8-9 should NOT import each
 * other's action files except through this documented contract, and
 * should keep reading/writing shared state via
 * `features/kontenai/lib/mock-db.ts` rather than duplicating local
 * arrays, so everyone converges on the same data.
 */
export {};
