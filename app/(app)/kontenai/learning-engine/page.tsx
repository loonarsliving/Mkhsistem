import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { LearningDashboardWorkspace } from "@/features/kontenai/learning-engine/components/learning-dashboard-workspace";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Learning Engine" };

export default async function LearningEnginePage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning Engine"
        description="Catat performa konten yang sudah dipublikasikan (views, reach, likes, comments, shares, saves, CTR, leads), lalu AI menjelaskan mengapa konten berhasil/kurang berhasil dan merekomendasikan hook, durasi, CTA, visual, dan target emotion untuk konten berikutnya."
      />
      <LearningDashboardWorkspace />
    </div>
  );
}
