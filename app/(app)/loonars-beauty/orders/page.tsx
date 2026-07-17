import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { OrderBoard } from "@/features/loonars-beauty/components/order-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Loonars Beauty - Order" };

export default async function LoonarsBeautyOrdersPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "loonars_beauty.manage");
  const canView = canManage || hasPermission(session, "loonars_beauty.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="Order" description="Catat & pantau order HydraGlow Advanced Brightening Lotion -- dari WhatsApp, marketplace, atau channel lain." />
      <OrderBoard canManage={canManage} />
    </div>
  );
}
