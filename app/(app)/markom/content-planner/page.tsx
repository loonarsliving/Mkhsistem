import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { CompetitorTracker } from "@/features/markom/components/competitor-tracker";
import { ContentPlannerOverview } from "@/features/markom/components/content-planner-overview";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Content Planner" };

export default async function ContentPlannerPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "content_planner.manage");
  const canView = canManage || hasPermission(session, "content_planner.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Content Planner"
          description="AI menganalisis performa akun, memantau kompetitor, dan meriset tren -- lalu membuat checklist konten harian untuk tim Markom."
        />
        <Button variant="outline" asChild>
          <Link href="/markom">
            Lihat Checklist Konten <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <ContentPlannerOverview />
      <CompetitorTracker canManage={canManage} />
    </div>
  );
}
