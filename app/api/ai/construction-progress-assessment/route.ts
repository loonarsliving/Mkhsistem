import { NextResponse } from "next/server";

import { assessOverallProjectProgress, type ProgressBlockInput } from "@/lib/ai/domains/construction-overall-progress";
import { logger } from "@/lib/logger";
import { requireCronAuth } from "@/lib/security/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_NAME_BY_CODE: Record<string, string> = {
  LL: "Loonars Living Villa",
};

/**
 * Invoked weekly by pg_cron (construction-progress-assessment-dispatch,
 * 0227) via automation_post. Groups construction_blocks by project_code
 * (currently just LL/Loonars Living), synthesizes one overall progress %
 * per project from each block's latest 7-day AI photo reading, and
 * overwrites construction_progress_assessments (one row per project_code)
 * -- shown on /construction-finance, not sent as a notification.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  const supabase = createAdminClient();

  const { data: blocks, error: blocksError } = await supabase.from("construction_blocks").select("id, code, project_code").order("code");
  if (blocksError) {
    logger.error("construction-progress-assessment: failed to load blocks", { error: blocksError.message });
    return NextResponse.json({ error: blocksError.message }, { status: 500 });
  }
  if (!blocks || blocks.length === 0) {
    return NextResponse.json({ assessed: 0 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: photos, error: photosError } = await supabase
    .from("construction_progress_photos")
    .select("block_id, ai_stage, ai_progress_pct, ai_notes, ai_concerns, created_at")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false });
  if (photosError) {
    logger.error("construction-progress-assessment: failed to load photos", { error: photosError.message });
    return NextResponse.json({ error: photosError.message }, { status: 500 });
  }

  const latestByBlock = new Map<string, (typeof photos)[number]>();
  const countByBlock = new Map<string, number>();
  for (const photo of photos ?? []) {
    countByBlock.set(photo.block_id, (countByBlock.get(photo.block_id) ?? 0) + 1);
    if (!latestByBlock.has(photo.block_id)) latestByBlock.set(photo.block_id, photo);
  }

  const blocksByProject = new Map<string, typeof blocks>();
  for (const block of blocks) {
    const list = blocksByProject.get(block.project_code) ?? [];
    list.push(block);
    blocksByProject.set(block.project_code, list);
  }

  let assessed = 0;
  for (const [projectCode, projectBlocks] of blocksByProject) {
    const blockInputs: ProgressBlockInput[] = projectBlocks.map((b) => {
      const latest = latestByBlock.get(b.id);
      return {
        code: b.code,
        aiStage: latest?.ai_stage ?? null,
        aiProgressPct: latest?.ai_progress_pct ?? null,
        aiNotes: latest?.ai_notes ?? null,
        aiConcerns: latest?.ai_concerns ?? null,
        photoCount7d: countByBlock.get(b.id) ?? 0,
        lastPhotoAt: latest?.created_at ?? null,
      };
    });

    let assessment;
    try {
      assessment = await assessOverallProjectProgress({
        projectName: PROJECT_NAME_BY_CODE[projectCode] ?? projectCode,
        blocks: blockInputs,
      });
    } catch (err) {
      logger.error("construction-progress-assessment: AI synthesis failed", { projectCode, error: String(err) });
      continue;
    }

    const { error: upsertError } = await supabase.from("construction_progress_assessments").upsert({
      project_code: projectCode,
      assessed_at: new Date().toISOString(),
      overall_progress_pct: assessment.overallProgressPct,
      summary: assessment.summary,
      concerns: assessment.concerns,
      block_count: projectBlocks.length,
      block_count_with_photos: blockInputs.filter((b) => b.photoCount7d > 0).length,
      block_snapshot: blockInputs as unknown as Json,
    });
    if (upsertError) {
      logger.error("construction-progress-assessment: failed to upsert assessment", { projectCode, error: upsertError.message });
      continue;
    }
    assessed += 1;
  }

  return NextResponse.json({ assessed });
}
