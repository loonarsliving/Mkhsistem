import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompetitorTracker } from "@/features/markom/components/competitor-tracker";
import { ContentPlannerOverview } from "@/features/markom/components/content-planner-overview";
import { TeamChecklistSection } from "@/features/markom/components/team-checklist-section";
import { ContentBoard } from "@/features/loonars-beauty/components/content-board";
import { ContentRatioSummary } from "@/features/loonars-beauty/components/content-ratio-summary";
import { RetargetingAlerts } from "@/features/loonars-beauty/components/retargeting-alerts";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Content Planner" };

/**
 * Content Planner as the single hub for all three of the company's content
 * lines, each its own tab: Leasehold (villa/rumah investor-pitch content),
 * Occupancy (villa-as-a-stay booking content, see migration 0121), and
 * Beauty (Loonars Beauty skincare, its own loonars_content_items system --
 * see repositories/loonars-beauty.repository.ts). Leasehold/Occupancy share
 * one Instagram/TikTok account (ContentPlannerOverview) but reliably split
 * by kpi_tasks.content_focus (migration 0123) rather than the old
 * description-marker-string convention. Beauty is a structurally separate
 * product (own account, own content table) with its own permission
 * (loonars_beauty.view/manage) -- gated as its own tab rather than forced
 * into the kpi_tasks checklist shape it doesn't use.
 */
export default async function ContentPlannerPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "content_planner.manage");
  const canView = canManage || hasPermission(session, "content_planner.view");
  if (!canView) notFound();

  const canManageBeauty = hasPermission(session, "loonars_beauty.manage");
  const canViewBeauty = canManageBeauty || hasPermission(session, "loonars_beauty.view");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Content Planner"
          description="AI menganalisis performa akun, memantau kompetitor, dan meriset tren -- lalu membuat checklist konten harian untuk tiap lini produk."
        />
        <Button variant="outline" asChild>
          <Link href="/markom">
            Lihat Semua Checklist Tim <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <ContentPlannerOverview />

      <Tabs defaultValue="leasehold_sales">
        <TabsList>
          <TabsTrigger value="leasehold_sales">Leasehold</TabsTrigger>
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          {canViewBeauty && <TabsTrigger value="beauty">Beauty</TabsTrigger>}
        </TabsList>

        <TabsContent value="leasehold_sales" className="space-y-6">
          <CompetitorTracker canManage={canManage} />
          <TeamChecklistSection focus="leasehold_sales" title="Checklist Konten Leasehold" />
        </TabsContent>

        <TabsContent value="occupancy" className="space-y-6">
          <TeamChecklistSection focus="occupancy" title="Checklist Konten Occupancy" />
        </TabsContent>

        {canViewBeauty && (
          <TabsContent value="beauty" className="space-y-6">
            <ContentRatioSummary />
            <RetargetingAlerts />
            <ContentBoard canManage={canManageBeauty} />
            <p className="text-xs text-muted-foreground">
              Data order & performa detail Loonars Beauty ada di{" "}
              <Link href="/loonars-beauty" className="text-primary hover:underline">
                halaman Loonars Beauty
              </Link>
              .
            </p>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
