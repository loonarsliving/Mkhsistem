import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { ContentIdeaGenerator } from "@/features/loonars-beauty/components/content-idea-generator";
import { WeeklyEvaluationCard } from "@/features/loonars-beauty/components/weekly-evaluation-card";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Loonars Beauty - Evaluasi Mingguan" };

export default async function LoonarsBeautyEvaluationPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "loonars_beauty.manage");
  const canView = canManage || hasPermission(session, "loonars_beauty.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluasi Mingguan & AI"
        description="AI mengevaluasi performa & rasio konten tiap Senin, merekomendasikan konten untuk di-boost, dan membantu membuat ide konten baru."
      />
      <WeeklyEvaluationCard canManage={canManage} />
      <ContentIdeaGenerator canManage={canManage} />
    </div>
  );
}
