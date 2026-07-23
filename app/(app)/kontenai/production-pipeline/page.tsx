import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { PipelineBoard } from "@/features/kontenai/production-pipeline/components/pipeline-board";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Production Pipeline" };

export default async function ProductionPipelinePage() {
  await requireKontenAiAccess();

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
