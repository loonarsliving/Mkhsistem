import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { TeamChecklistSection } from "@/features/markom/components/team-checklist-section";
import { TaskReviewBoard } from "@/features/markom/components/task-review-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Markom" };

export default async function MarkomPage() {
  const session = await requireSession();
  const isMarkom = hasPermission(session, "kpi_task.view_own");
  const canReview = hasPermission(session, "kpi_task.view_branch") || hasPermission(session, "kpi_task.view_all");

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
    </div>
  );
}
