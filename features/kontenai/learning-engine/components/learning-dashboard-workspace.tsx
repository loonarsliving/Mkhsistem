"use client";

import { LearningInsightList } from "@/features/kontenai/learning-engine/components/learning-insight-list";
import { PerformanceLogForm } from "@/features/kontenai/learning-engine/components/performance-log-form";

/** Learning Engine's workspace: log performance + generate AI insight on the left, the full Learning Dashboard history on the right. */
export function LearningDashboardWorkspace() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <PerformanceLogForm />
      <LearningInsightList />
    </div>
  );
}
