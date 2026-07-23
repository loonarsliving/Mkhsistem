import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { PromoTemplateManager } from "@/features/crm/components/promo-template-manager";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Promo Broadcast" };

export default async function PromoBroadcastPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "promo_template.manage");
  const canView = canManage || hasPermission(session, "promo_template.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promo Broadcast"
        description="Follow-up otomatis ke prospect yang belum sempat ditindaklanjuti sales -- sistem yang menjaga, bukan cuma menunggu manusia."
      />
      <PromoTemplateManager canManage={canManage} />
    </div>
  );
}
