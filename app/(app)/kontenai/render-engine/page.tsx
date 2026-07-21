import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { RenderEngineBoard } from "@/features/kontenai/render-engine/components/render-engine-board";
import {
  listRenderJobsAction,
  listStoryboardsReadyToRenderAction,
} from "@/features/kontenai/render-engine/actions/render-engine.actions";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Render Engine" };

export default async function RenderEnginePage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

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
