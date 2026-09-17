import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { OccupancyAssetLibrary } from "@/features/occupancy-ads/components/occupancy-asset-library";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Creative Asset Library — Loonars AI Occupancy Ads" };

export default async function OccupancyAdsAssetsPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "occupancy_ads.manage");
  const canView = canManage || hasPermission(session, "occupancy_ads.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creative Asset Library"
        description="Aset foto/video nyata untuk campaign Occupancy Ads -- unggah, beri tag, tetapkan properti, lalu alurkan lewat status draft -> ai_generated -> review -> approved -> ready_for_meta -> active sebelum dipakai AI membuat brief/varian."
        actions={
          <Button asChild variant="outline">
            <Link href="/occupancy-ads">Kembali ke Dashboard</Link>
          </Button>
        }
      />
      <OccupancyAssetLibrary canManage={canManage} userId={session.userId} />
    </div>
  );
}
