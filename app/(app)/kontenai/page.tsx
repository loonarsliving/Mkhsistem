import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { KontenAiDashboard } from "@/features/kontenai/components/kontenai-dashboard";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "KontenAI" };

export default async function KontenAiPage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="KontenAI"
        description="AI production engine yang mengubah hasil Content Planner menjadi konten siap tayang, lalu mengirimkannya ke Content Studio untuk dinilai dan direvisi bila perlu."
      />
      <KontenAiDashboard />
    </div>
  );
}
