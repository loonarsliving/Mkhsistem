import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { AiDirectorBoard } from "@/features/kontenai/ai-director/components/ai-director-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "AI Director" };

export default async function AiDirectorPage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

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
