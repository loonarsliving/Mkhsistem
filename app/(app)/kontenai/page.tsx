import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { KontenAiDashboard } from "@/features/kontenai/components/kontenai-dashboard";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "KontenAI" };

export default async function KontenAiPage() {
  await requireKontenAiAccess();

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
