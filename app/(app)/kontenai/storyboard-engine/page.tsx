import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { StoryboardEngineBoard } from "@/features/kontenai/storyboard-engine/components/storyboard-engine-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Storyboard Engine" };

export default async function StoryboardEnginePage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storyboard Engine"
        description="Ubah Production Directive dari AI Director menjadi storyboard scene-by-scene yang siap diteruskan ke Asset Selector."
      />
      <StoryboardEngineBoard />
    </div>
  );
}
