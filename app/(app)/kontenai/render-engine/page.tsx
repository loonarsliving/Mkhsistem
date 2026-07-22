import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { RenderEngineBoard } from "@/features/kontenai/render-engine/components/render-engine-board";
import {
  listRenderJobsAction,
  listStoryboardsReadyToRenderAction,
} from "@/features/kontenai/render-engine/actions/render-engine.actions";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Render Engine" };

export default async function RenderEnginePage() {
  await requireKontenAiAccess();

  const [storyboards, jobs] = await Promise.all([listStoryboardsReadyToRenderAction(), listRenderJobsAction()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Render Engine"
        description="Antrian dan status render storyboard menjadi video final -- dari queued, rendering dengan progres langsung, hingga completed atau failed."
      />
      <RenderEngineBoard initialStoryboards={storyboards} initialJobs={jobs} />
    </div>
  );
}
