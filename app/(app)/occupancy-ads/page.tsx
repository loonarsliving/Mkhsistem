import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { OccupancyDashboard } from "@/features/occupancy-ads/components/occupancy-dashboard";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Loonars AI Occupancy Ads" };
/** Launch chains an image/video upload to Meta + 4 sequential Graph API calls (campaign/adset/creative/ad), same timeout reasoning as Ads Specialist's maxDuration. */
export const maxDuration = 120;

export default async function OccupancyAdsPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "occupancy_ads.manage");
  const canView = canManage || hasPermission(session, "occupancy_ads.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loonars AI Occupancy Ads"
        description="AI membaca okupansi nyata dari villa-api, mengusulkan campaign iklan Meta untuk mengisi tanggal-tanggal sepi, dan menunggu persetujuan manusia sebelum meluncurkan (spend nyata)."
      />
      <OccupancyDashboard canManage={canManage} />
    </div>
  );
}
