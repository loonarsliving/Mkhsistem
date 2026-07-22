import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { TeamChecklistSection } from "@/features/markom/components/team-checklist-section";
import { TaskReviewBoard } from "@/features/markom/components/task-review-board";
import { ContentBoard } from "@/features/loonars-beauty/components/content-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Markom" };

export default async function MarkomPage() {
  const session = await requireSession();
  const isMarkom = hasPermission(session, "kpi_task.view_own");
  const canReview = hasPermission(session, "kpi_task.view_branch") || hasPermission(session, "kpi_task.view_all");
  const canManageBeauty = hasPermission(session, "loonars_beauty.manage");
  const canViewBeauty = canManageBeauty || hasPermission(session, "loonars_beauty.view");

  if (!isMarkom && !canReview) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Markom"
        description="Checklist mingguan tim berbasis penyelesaian task — bukan revenue atau unit."
      />
      {isMarkom && !canReview && <TeamChecklistSection />}
      {canReview && <TaskReviewBoard />}
      {/* Beauty's content ideas live in loonars_content_items, a structurally
          separate table from kpi_tasks (see content-planner/page.tsx's doc
          comment) -- surfaced here too so Markom sees it as part of their
          one daily checklist instead of only under the separate Loonars
          Beauty/Content Planner pages. */}
      {isMarkom && canViewBeauty && <ContentBoard canManage={canManageBeauty} />}
    </div>
  );
}
