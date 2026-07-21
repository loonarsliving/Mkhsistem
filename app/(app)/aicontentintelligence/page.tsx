import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { AiContentIntelligenceDashboard } from "@/features/ai-content-intelligence/components/ai-content-intelligence-dashboard";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "AI Content Intelligence" };

export default async function AiContentIntelligencePage() {
  const session = await requireSession();
  const canView = hasPermission(session, "content_planner.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Content Intelligence"
        description="Build, manage, and optimize AI-powered content production using Gemini Vision, Asset Library, and automated rendering."
      />
      <AiContentIntelligenceDashboard />
    </div>
  );
}
