import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { ContentBoard } from "@/features/loonars-beauty/components/content-board";
import { ContentRatioSummary } from "@/features/loonars-beauty/components/content-ratio-summary";
import { RetargetingAlerts } from "@/features/loonars-beauty/components/retargeting-alerts";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Loonars Beauty" };

export default async function LoonarsBeautyPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "loonars_beauty.manage");
  const canView = canManage || hasPermission(session, "loonars_beauty.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loonars Beauty"
        description="Rencana & rotasi konten HydraGlow Advanced Brightening Lotion -- 40% problem-solution, 30% testimoni/UGC, 20% edukasi, 10% promosi."
      />
      <ContentRatioSummary />
      <RetargetingAlerts />
      <ContentBoard canManage={canManage} />
    </div>
  );
}
