import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { KpiRankingTable } from "@/features/markom/components/kpi-ranking-table";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Ranking Markom" };

export default async function MarkomRankingPage() {
  const session = await requireSession();
  if (!hasPermission(session, "kpi_task.view_branch") && !hasPermission(session, "kpi_task.view_all")) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ranking Markom" description="Diurutkan berdasarkan Achievement % penyelesaian task, bukan jumlah task." />
      <KpiRankingTable />
    </div>
  );
}
