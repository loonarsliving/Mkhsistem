import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { assessConstructionProgress, fetchImageAsBase64 } from "./construction-progress-vision";

export type ProgressTrackOutcome = "tracked" | "block_unknown" | "not_applicable" | "assessment_failed";

export interface ProgressTrackResult {
  outcome: ProgressTrackOutcome;
  blockCode?: string;
  stage?: string;
  progressPct?: number;
}

// Loonars Living's fixed block list (owner-provided, 0199) -- A1-A5, B1-B4, C1-C4.
const KNOWN_BLOCKS = ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4"];

/** Matches a block code as a whole token (not a substring of a longer word/number) anywhere in the caption, case-insensitive. */
function extractBlockCode(caption: string | undefined): string | null {
  if (!caption) return null;
  const upper = caption.toUpperCase();
  for (const code of KNOWN_BLOCKS) {
    const re = new RegExp(`(^|[^A-Z0-9])${code}([^A-Z0-9]|$)`);
    if (re.test(upper)) return code;
  }
  return null;
}

/**
 * Endy-specific (same scoping rationale as 0197/0198 -- see their notes on
 * why this isn't role-wide). Every progress photo he sends, captioned with
 * a block code, gets a Gemini Vision progress assessment stored for the
 * Saturday 13:00 report (construction_send_progress_report, 0199) --
 * advisory data the owner reviews before deciding sisa uang tukang per
 * blok, never an automatic payment decision.
 */
export async function tryTrackConstructionProgressPhoto(
  employee: { id: string; full_name: string },
  imageUrl: string,
  caption: string | undefined,
): Promise<ProgressTrackResult> {
  if (!employee.full_name.toLowerCase().includes("endy")) {
    return { outcome: "not_applicable" };
  }

  const blockCode = extractBlockCode(caption);
  if (!blockCode) {
    return { outcome: "block_unknown" };
  }

  const supabase = createAdminClient();
  const { data: block } = await supabase.from("construction_blocks").select("id").eq("code", blockCode).maybeSingle();
  if (!block) {
    return { outcome: "block_unknown" };
  }

  const image = await fetchImageAsBase64(imageUrl);
  if (!image) {
    await supabase.from("construction_progress_photos").insert({ employee_id: employee.id, block_id: block.id, image_url: imageUrl, caption: caption ?? null });
    return { outcome: "assessment_failed", blockCode };
  }

  try {
    const assessment = await assessConstructionProgress({ blockCode, imageBase64: image.data, imageMimeType: image.mimeType });
    await supabase.from("construction_progress_photos").insert({
      employee_id: employee.id,
      block_id: block.id,
      image_url: imageUrl,
      caption: caption ?? null,
      ai_stage: assessment.stage,
      ai_progress_pct: assessment.progressPct,
      ai_notes: assessment.notes,
      ai_concerns: assessment.concerns.join("; ") || null,
    });
    return { outcome: "tracked", blockCode, stage: assessment.stage, progressPct: assessment.progressPct };
  } catch {
    await supabase.from("construction_progress_photos").insert({ employee_id: employee.id, block_id: block.id, image_url: imageUrl, caption: caption ?? null });
    return { outcome: "assessment_failed", blockCode };
  }
}
