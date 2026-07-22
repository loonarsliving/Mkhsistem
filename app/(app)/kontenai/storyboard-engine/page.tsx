import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { StoryboardWorkspace } from "@/features/kontenai/storyboard-engine/components/storyboard-workspace";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Storyboard Engine" };

export default async function StoryboardEnginePage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storyboard Engine"
        description="Ubah Creative Brief dari AI Director menjadi storyboard scene-by-scene -- lengkap dengan visual description, camera angle, shot type, motion, voice over, dan on-screen text per scene, siap diedit dan dipreview."
      />
      <StoryboardWorkspace />
    </div>
  );
}
