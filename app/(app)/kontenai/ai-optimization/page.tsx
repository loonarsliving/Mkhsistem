import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { OptimizationBoard } from "@/features/kontenai/ai-optimization/components/optimization-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "AI Optimization" };

/**
 * Sprint 9 - AI Optimization: closes the KontenAI pipeline loop. Reads
 * Learning Engine records (Sprint 8) and Content Studio/Analytics
 * performance patterns to propose OptimizationRecommendations targeting
 * a specific pipeline area (AI Director, Storyboard, Asset Selection,
 * Render), which a user can apply or dismiss.
 */
export default async function AiOptimizationPage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Optimization"
        description="Rekomendasi optimasi berbasis pola dari Learning Engine dan performa Content Studio -- terapkan atau tolak untuk menyempurnakan AI Director, Storyboard, Asset Selection, dan Render ke depan."
      />
      <OptimizationBoard />
    </div>
  );
}
