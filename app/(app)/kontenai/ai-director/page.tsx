import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AiDirectorBoard } from "@/features/kontenai/ai-director/components/ai-director-board";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "AI Director" };

export default async function AiDirectorPage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Director"
        description="Mengubah brief Content Planner (dilengkapi insight Content Audit bila tersedia) menjadi arahan produksi -- narrative angle, key messages, gaya visual, tag aset yang direkomendasikan, dan CTA -- siap diteruskan ke Storyboard Engine."
      />
      <AiDirectorBoard />
    </div>
  );
}
