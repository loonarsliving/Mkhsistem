import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { RecommendationWorkspace } from "@/features/kontenai/analytics/components/recommendation-workspace";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "AI Optimization" };

export default async function AiOptimizationPage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Optimization"
        description="AI Recommendation berbasis riwayat Learning Engine -- Hook, Caption, CTA, Durasi, Visual Style, dan Posting Time untuk konten berikutnya."
      />
      <RecommendationWorkspace />
    </div>
  );
}
