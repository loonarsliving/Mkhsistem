/**
 * Local types for the Gemini Vision sub-module (Sprint 2 of KontenAI).
 * Extends the shared AssetRecord/AssetVisionMetadata contracts from
 * features/kontenai/types.ts with UI-only state that has no reason to
 * live in the shared contract file.
 */
import type { AssetRecord } from "@/features/kontenai/types";

/** Per-row analysis lifecycle, driven purely by client state. */
export type AnalysisStatus = "not_analyzed" | "analyzing" | "analyzed" | "failed";

export interface AnalysisQueueItem {
  asset: AssetRecord;
  status: AnalysisStatus;
}
