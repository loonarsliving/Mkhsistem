import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { ConversionAnalytics } from "@/features/crm/components/conversion-analytics";
import { RankingTable } from "@/features/crm/components/ranking-table";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Analitik CRM" };

export default async function CrmAnalyticsPage() {
  const session = await requireSession();
  const canViewAll = hasPermission(session, "crm_analytics.view_all");
  if (!hasPermission(session, "crm_analytics.view_branch") && !canViewAll) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Analitik CRM" description="Konversi, performa sumber prospect, dan ranking sales." />
      {/* Collection (real closing/fee value) is Super Admin/CFO territory -- hidden for
          Kepala Cabang (crm_analytics.view_branch only); crm_sales_ranking also locks
          the ranking to their own branch and nulls collection for that same caller. */}
      <RankingTable showCollection={canViewAll} />
      <ConversionAnalytics />
    </div>
  );
}
