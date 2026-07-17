import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { PerformanceLog } from "@/features/loonars-beauty/components/performance-log";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Loonars Beauty - Performa Konten" };

export default async function LoonarsBeautyPerformancePage() {
  const session = await requireSession();
  const canView = hasPermission(session, "loonars_beauty.view") || hasPermission(session, "loonars_beauty.manage");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="Performa Konten" description="Catat performa harian konten (view/klik/watch-time) untuk memantau efektivitas rotasi konten." />
      <PerformanceLog />
    </div>
  );
}
