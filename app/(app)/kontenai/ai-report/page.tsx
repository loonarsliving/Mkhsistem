import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AiReportWorkspace } from "@/features/kontenai/analytics/components/ai-report-workspace";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "AI Report" };

export default async function AiReportPage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader title="AI Report" description="Rangkuman performa mingguan dan bulanan seluruh konten KontenAI, dihasilkan AI berdasarkan data KPI nyata." />
      <AiReportWorkspace />
    </div>
  );
}
