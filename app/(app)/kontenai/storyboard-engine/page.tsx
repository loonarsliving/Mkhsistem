import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { StoryboardEngineBoard } from "@/features/kontenai/storyboard-engine/components/storyboard-engine-board";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Storyboard Engine" };

export default async function StoryboardEnginePage() {
  await requireKontenAiAccess();

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
