import "server-only";

import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { listUnanalyzedAssetsByCompany } from "@/repositories/kontenai-assets.repository";

/**
 * How much of the brief's brand folder one production run is willing to
 * analyze. Deliberately bounded: this runs inline in a production run, so it
 * has to finish, and it is not trying to work through the whole library --
 * whatever is left over gets picked up by the next video's run.
 */
export const VISION_PER_RUN_LIMIT = 8;

export interface BrandFootageVisionOutcome {
  /** Footage Gemini Vision read during this run, now available to the ranking. */
  analyzed: number;
  /** Footage that could not be read; recorded as failed and excluded from the pool. */
  failed: number;
}

/**
 * Analyze the footage this brief's brand might use, inside the production run
 * that needs it.
 *
 * This is where Vision belongs. Google Drive is storage; the per-brand folders
 * exist so a brief can be matched against its own brand's footage. Without
 * this step the ranking sees only listAnalyzedAssetLibrary, i.e.
 * ai_vision_status='completed' -- so freshly-synced Drive footage is invisible
 * to it and every scene falls through to Veo generation while the real footage
 * sits untouched.
 *
 * Shared by runAssetSelectionAction (Asset Selector page, "Kirim ke KontenAI")
 * and processKontenAiAutoProduce/processKontenAiAutoProduceBeauty (the cron
 * pipeline) so both paths see the same library. The automation path is the one
 * that matters most here -- nobody is watching it to click "Analyze" first.
 *
 * Never throws: a clip that cannot be read is recorded as failed by
 * runVisionAnalysisAndSave and simply does not join the pool. Producing a
 * video from the footage that did analyze beats failing the whole run.
 */
export async function analyzeBrandFootageForRun(
  supabase: TypedSupabaseClient,
  contentFocus: string | null,
  limit: number = VISION_PER_RUN_LIMIT,
): Promise<BrandFootageVisionOutcome> {
  if (!contentFocus) return { analyzed: 0, failed: 0 };

  const pending = await listUnanalyzedAssetsByCompany(supabase, contentFocus, limit);
  if (pending.length === 0) return { analyzed: 0, failed: 0 };

  // Lazily imported: this module is reachable from the process-job route, and
  // the vision runner pulls in lib/video/extract-keyframes. Keeping it out of
  // module scope means a runtime without ffmpeg can't break the whole route.
  const { runVisionAnalysisAndSave } = await import("@/features/kontenai/asset-library/actions/gemini-vision.actions");

  let analyzed = 0;
  let failed = 0;
  for (const asset of pending) {
    // Sequential, not Promise.all: these are Gemini vision calls sharing one
    // circuit breaker with every other AI feature in this system.
    const outcome = await runVisionAnalysisAndSave(supabase, asset);
    if (outcome.success) analyzed += 1;
    else failed += 1;
  }
  return { analyzed, failed };
}
