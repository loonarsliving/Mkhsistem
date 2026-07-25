"use client";

import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { companyAttendanceSummaryAction } from "@/features/dashboard/actions/dashboard-query.actions";
import { AttendanceSummaryCard } from "@/features/dashboard/components/attendance-summary-card";
import { PendingApprovalsCard } from "@/features/dashboard/components/pending-approvals-card";
import { CrmDirectorSummaryCard } from "@/features/dashboard/components/crm-director-summary-card";
import { PayrollStatusCard } from "@/features/dashboard/components/payroll-status-card";
import {
  conversionAnalyticsAction,
  monthlyTrendAction,
  nationalStatsAction,
} from "@/features/crm/actions/crm-query.actions";
import { ExecutiveDashboardSection } from "@/features/crm/components/executive-dashboard-section";
import { OperationalDashboardSection } from "@/features/crm/components/operational-dashboard-section";

/**
 * Director-tier dashboard sections all key off the same heavy
 * crm_national_stats RPC (plus conversion/trend for the generic tier).
 * These used to sit in the page's server-side Promise.all and add to TTFB
 * for every load; only one of the three components below ever mounts per
 * session (role is fixed), so moving the fetch client-side costs nothing
 * extra and lets the page shell render immediately.
 */

function useAttendanceSummary() {
  return useQuery({ queryKey: ["company-attendance-summary"], queryFn: companyAttendanceSummaryAction });
}

export function DirekturUtamaSection() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["national-stats"], queryFn: () => nationalStatsAction() });
  const { data: summary, isLoading: summaryLoading } = useAttendanceSummary();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!stats) return null;
  return (
    <>
      <ExecutiveDashboardSection stats={stats} />
      {!summaryLoading && summary && <AttendanceSummaryCard summary={summary} />}
    </>
  );
}

export function DirekturOperasionalSection({
  registrationCount,
}: {
  registrationCount: number | undefined;
}) {
  const { data: stats, isLoading } = useQuery({ queryKey: ["national-stats"], queryFn: () => nationalStatsAction() });
  const { data: summary, isLoading: summaryLoading } = useAttendanceSummary();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!stats) return null;
  return (
    <>
      <OperationalDashboardSection stats={stats} />
      <div className="grid gap-6 sm:grid-cols-2">
        {!summaryLoading && summary && <AttendanceSummaryCard summary={summary} />}
        <PendingApprovalsCard registrationCount={registrationCount} financeVerificationCount={stats.pending_finance_verification ?? 0} />
      </div>
    </>
  );
}

export function GenericDirectorSection({
  registrationCount,
}: {
  registrationCount: number | undefined;
}) {
  const { data: stats, isLoading } = useQuery({ queryKey: ["national-stats"], queryFn: () => nationalStatsAction() });
  const { data: conversion } = useQuery({ queryKey: ["crm-conversion-analytics"], queryFn: () => conversionAnalyticsAction() });
  const { data: trend } = useQuery({ queryKey: ["crm-monthly-trend"], queryFn: () => monthlyTrendAction(6) });
  const { data: summary, isLoading: summaryLoading } = useAttendanceSummary();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <>
      {stats && <CrmDirectorSummaryCard stats={stats} conversion={conversion ?? null} trend={trend ?? []} />}
      <div className="grid gap-6 sm:grid-cols-2">
        {!summaryLoading && summary && <AttendanceSummaryCard summary={summary} />}
        <PayrollStatusCard />
        <PendingApprovalsCard registrationCount={registrationCount} financeVerificationCount={stats?.pending_finance_verification ?? 0} />
      </div>
    </>
  );
}
