import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { ErrorLogTable } from "@/features/monitoring/components/error-log-table";
import { HealthStatusCard } from "@/features/monitoring/components/health-status-card";
import { PerformanceSummaryCards } from "@/features/monitoring/components/performance-summary-cards";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Monitoring" };

export default async function MonitoringPage() {
  await requirePermission("system.monitoring_view");

  return (
    <div className="space-y-6">
      <PageHeader title="Monitoring" description="Kesehatan sistem, log error, dan performa aplikasi." />
      <HealthStatusCard />
      <PerformanceSummaryCards />
      <ErrorLogTable />
    </div>
  );
}
