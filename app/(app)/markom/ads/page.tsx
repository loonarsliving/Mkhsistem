import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { AdAccountBalanceCard } from "@/features/markom/components/ad-account-balance-card";
import { AdCampaignList } from "@/features/markom/components/ad-campaign-list";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Ads Specialist" };
/** "Luncurkan" chains an image upload + 4 sequential Meta API calls (campaign/adset/creative/ad) -- can legitimately take 15-30s, well past the platform's default Server Action timeout. */
export const maxDuration = 60;

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
      <AdAccountBalanceCard />
      <AdCampaignList canManage={canManage} />
    </div>
  );
}
