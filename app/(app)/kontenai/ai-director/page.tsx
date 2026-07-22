import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CreativeBriefWorkspace } from "@/features/kontenai/ai-director/components/creative-brief-workspace";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "AI Director" };

export default async function AiDirectorPage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Director"
        description="Otak kreatif KontenAI: isi objective, platform, target audience, product/project, dan campaign goal -- AI Director membaca Asset Library & hasil Gemini Vision, lalu menyusun Creative Brief (Big Idea, Hook, Key Message, Target Emotion, CTA, Content Angle)."
      />
      <CreativeBriefWorkspace />
    </div>
  );
}
