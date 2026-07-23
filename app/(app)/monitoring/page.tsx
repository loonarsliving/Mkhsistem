import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AiHealthStatusCard } from "@/features/monitoring/components/ai-health-status-card";
import { ErrorLogTable } from "@/features/monitoring/components/error-log-table";
import { HealthStatusCard } from "@/features/monitoring/components/health-status-card";
import { MetaHealthStatusCard } from "@/features/monitoring/components/meta-health-status-card";
import { PerformanceSummaryCards } from "@/features/monitoring/components/performance-summary-cards";
import { TikTokHealthStatusCard } from "@/features/monitoring/components/tiktok-health-status-card";
import { WhatsAppHealthStatusCard } from "@/features/monitoring/components/whatsapp-health-status-card";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Monitoring" };

export default async function MonitoringPage() {
  await requirePermission("system.monitoring_view");

  return (
    <div className="space-y-6">
      <PageHeader title="Monitoring" description="Kesehatan sistem, log error, dan performa aplikasi." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <HealthStatusCard />
        <AiHealthStatusCard />
        <WhatsAppHealthStatusCard />
        <MetaHealthStatusCard />
        <TikTokHealthStatusCard />
      </div>
      <PerformanceSummaryCards />
      <ErrorLogTable />
    </div>
  );
}
