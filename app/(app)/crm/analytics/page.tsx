import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { ConversionAnalytics } from "@/features/crm/components/conversion-analytics";
import { RankingTable } from "@/features/crm/components/ranking-table";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Analitik CRM" };

export default async function CrmAnalyticsPage() {
  const session = await requireSession();
  if (!hasPermission(session, "crm_analytics.view_branch") && !hasPermission(session, "crm_analytics.view_all")) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Analitik CRM" description="Konversi, performa sumber prospect, dan ranking sales." />
      <RankingTable />
      <ConversionAnalytics />
    </div>
  );
}
