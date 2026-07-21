import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { PipelineBoard } from "@/features/kontenai/production-pipeline/components/pipeline-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Production Pipeline" };

export default async function ProductionPipelinePage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Pipeline"
        description="Menghubungkan seluruh proses produksi KontenAI (brief hingga published) dan mengelola loop revisi dengan Content Studio."
      />
      <PipelineBoard />
    </div>
  );
}
