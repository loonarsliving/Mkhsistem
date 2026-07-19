import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentAuditBoard } from "@/features/markom/components/content-audit-board";
import { listWeeklyContentAuditsAction } from "@/features/markom/actions/social.actions";
import { listWeeklyContentAuditsAction as listBeautyWeeklyContentAuditsAction } from "@/features/loonars-beauty/actions/loonars-beauty.actions";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Content Audit" };

/**
 * Was leasehold-only because auditWeeklyBeautyContentPerformance (0133)
 * didn't exist yet -- loonars_weekly_evaluations (Loonars Beauty's own
 * /loonars-beauty/evaluation page) is a different, narrower thing
 * (content-ratio-vs-target + orders), never a per-post hook/value/CTA
 * score. Also fixed the permission gate here: it only ever checked
 * content_planner.view, which would 404 a Beauty-only user (loonars_
 * beauty.view but not content_planner.view) even though they should see
 * their own tab.
 */
export default async function ContentAuditPage() {
  const session = await requireSession();
  const canViewProperty = hasPermission(session, "content_planner.view");
  const canViewBeauty = hasPermission(session, "loonars_beauty.view") || hasPermission(session, "loonars_beauty.manage");
  if (!canViewProperty && !canViewBeauty) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Audit"
        description="Audit mingguan performa Instagram (dan TikTok, setelah terhubung) -- skor hook, value, CTA, kesesuaian niche, potensi engagement, dan optimasi platform untuk konten nyata yang sudah tayang."
      />
      {canViewProperty && canViewBeauty ? (
        <Tabs defaultValue="leasehold_sales">
          <TabsList>
            <TabsTrigger value="leasehold_sales">Leasehold</TabsTrigger>
            <TabsTrigger value="beauty">Beauty</TabsTrigger>
          </TabsList>
          <TabsContent value="leasehold_sales" className="mt-4">
            <ContentAuditBoard queryKey="content-audit-weekly-property" listAction={listWeeklyContentAuditsAction} />
          </TabsContent>
          <TabsContent value="beauty" className="mt-4">
            <ContentAuditBoard queryKey="content-audit-weekly-beauty" listAction={listBeautyWeeklyContentAuditsAction} />
          </TabsContent>
        </Tabs>
      ) : canViewProperty ? (
        <ContentAuditBoard queryKey="content-audit-weekly-property" listAction={listWeeklyContentAuditsAction} />
      ) : (
        <ContentAuditBoard queryKey="content-audit-weekly-beauty" listAction={listBeautyWeeklyContentAuditsAction} />
      )}
    </div>
  );
}
