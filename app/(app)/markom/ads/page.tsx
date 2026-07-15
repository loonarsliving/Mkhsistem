import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { AdCampaignList } from "@/features/markom/components/ad-campaign-list";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Ads Specialist" };

export default async function AdsSpecialistPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "ad_campaign.manage");
  const canView = canManage || hasPermission(session, "ad_campaign.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ads Specialist"
        description="AI meriset tren & kompetitor lalu meluncurkan iklan Click-to-WhatsApp secara otomatis menggunakan foto asli dari galeri project -- mengarahkan leads langsung ke WhatsApp."
      />
      <AdCampaignList canManage={canManage} />
    </div>
  );
}
