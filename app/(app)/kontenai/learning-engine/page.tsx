import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { LearningEngineDashboard } from "@/features/kontenai/learning-engine/components/learning-engine-dashboard";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Learning Engine" };

export default async function LearningEnginePage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning Engine"
        description="Riwayat hasil produksi dan feedback Content Studio -- setiap production run yang selesai didistilasi menjadi skor akhir, verdict, dan catatan 'apa yang berhasil' / 'apa yang perlu diperbaiki' untuk KontenAI belajar dari waktu ke waktu."
      />
      <LearningEngineDashboard />
    </div>
  );
}
