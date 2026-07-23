import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentStudioBoard } from "@/features/markom/components/content-studio-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Content Studio" };

/**
 * Content Studio -- Markom uploads finished content, Gemini scores it 0-10
 * (real vision review for photos), and a score >= 8.5 auto-schedules the
 * post for the account's best upload hour and publishes it via Zernio with
 * no further manual step (0142). Below 8.5 it comes back as
 * 'needs_revision' with concrete feedback instead. 3 submenus mirror the
 * same content_focus split Content Planner already uses: Leasehold and
 * Villa (occupancy) share kpi_tasks briefs, Beauty picks its brief from
 * loonars_content_items instead -- its own "Rencana Konten" plan, since
 * Beauty has no branch-scoped checklist (0143).
 */
export default async function ContentStudioPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "content_submission.manage");
  if (!canManage) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Studio"
        description="Upload konten (foto/video), AI memberi skor kelayakan tayang -- skor 8,5 ke atas otomatis dijadwalkan dan ditayangkan sistem lewat Zernio, di bawah itu diminta revisi."
      />

      <Tabs defaultValue="leasehold_sales">
        <TabsList>
          <TabsTrigger value="leasehold_sales">Leasehold</TabsTrigger>
          <TabsTrigger value="occupancy">Villa</TabsTrigger>
          <TabsTrigger value="beauty">Beauty</TabsTrigger>
        </TabsList>

        <TabsContent value="leasehold_sales" className="space-y-4">
          <ContentStudioBoard focus="leasehold_sales" />
        </TabsContent>
        <TabsContent value="occupancy" className="space-y-4">
          <ContentStudioBoard focus="occupancy" />
        </TabsContent>
        <TabsContent value="beauty" className="space-y-4">
          <ContentStudioBoard focus="beauty" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
