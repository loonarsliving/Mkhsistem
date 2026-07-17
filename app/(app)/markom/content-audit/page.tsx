import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { ContentAuditBoard } from "@/features/markom/components/content-audit-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Content Audit" };

export default async function ContentAuditPage() {
  const session = await requireSession();
  if (!hasPermission(session, "content_planner.view")) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Audit"
        description="Audit mingguan performa Instagram (dan TikTok, setelah terhubung) -- skor hook, value, CTA, kesesuaian niche, potensi engagement, dan optimasi platform untuk konten nyata yang sudah tayang."
      />
      <ContentAuditBoard />
    </div>
  );
}
