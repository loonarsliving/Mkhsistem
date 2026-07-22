import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AnalyticsDashboard } from "@/features/kontenai/analytics/components/analytics-dashboard";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics Dashboard"
        description="Pusat monitoring performa seluruh konten KontenAI -- KPI utama, tren performa per periode, serta konten dengan performa terbaik dan terburuk."
      />
      <AnalyticsDashboard />
    </div>
  );
}
