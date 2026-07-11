import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AttendanceStatsCard } from "@/features/dashboard/components/attendance-stats-card";
import { PendingRegistrationCard } from "@/features/dashboard/components/pending-registration-card";
import { ProfileSummaryCard } from "@/features/dashboard/components/profile-summary-card";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentAnnouncementList } from "@/features/dashboard/components/recent-announcement-list";
import { RecentMemoList } from "@/features/dashboard/components/recent-memo-list";
import { CheckInOutCard } from "@/features/attendance/components/check-in-out-card";
import { branchStatsAction, nationalStatsAction, salesStatsAction } from "@/features/crm/actions/crm-query.actions";
import { BranchDashboardSection } from "@/features/crm/components/branch-dashboard-section";
import { ExecutiveDashboardSection } from "@/features/crm/components/executive-dashboard-section";
import { OperationalDashboardSection } from "@/features/crm/components/operational-dashboard-section";
import { SalesDashboardSection } from "@/features/crm/components/sales-dashboard-section";
import {
  branchStatsAction as markomBranchStatsAction,
  employeeStatsAction as markomEmployeeStatsAction,
  nationalStatsAction as markomNationalStatsAction,
} from "@/features/markom/actions/markom-query.actions";
import { BranchDashboardSection as MarkomBranchDashboardSection } from "@/features/markom/components/branch-dashboard-section";
import { DirectorDashboardSection as MarkomDirectorDashboardSection } from "@/features/markom/components/director-dashboard-section";
import { EmployeeDashboardSection as MarkomEmployeeDashboardSection } from "@/features/markom/components/employee-dashboard-section";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getMonthlyStats, getTodayAttendance } from "@/repositories/attendance.repository";
import { listRecentAnnouncements } from "@/repositories/announcement.repository";
import { countPendingRegistrations } from "@/repositories/employee.repository";
import { listRecentMemos } from "@/repositories/memo.repository";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const canReviewRegistrations =
    hasPermission(session, "registration.view_all") || hasPermission(session, "registration.view_branch");
  const isSales = hasPermission(session, "prospect.create");
  const canViewBranchCrm = hasPermission(session, "crm_analytics.view_branch");
  // Direktur Utama and Direktur Operasional both hold crm_analytics.view_all
  // (needed elsewhere, e.g. /crm/analytics), so view_executive is the
  // tie-breaker for which home-dashboard widget to render: whoever holds it
  // (Direktur Utama) sees the pared-down Executive widget instead of the
  // full Operational one, even though both share view_all otherwise.
  const canViewExecutiveCrm = hasPermission(session, "crm_analytics.view_executive");
  const canViewOperationalCrm = hasPermission(session, "crm_analytics.view_all") && !canViewExecutiveCrm;
  const canViewNationalCrm = canViewOperationalCrm || canViewExecutiveCrm;
  const isMarkom = hasPermission(session, "kpi_task.view_own");
  const canViewBranchMarkom = hasPermission(session, "kpi_task.view_branch");
  const canViewNationalMarkom = hasPermission(session, "kpi_task.view_all");

  const [
    attendance,
    monthlyStats,
    memos,
    announcements,
    pendingRegistrationCount,
    salesStats,
    branchStats,
    nationalStats,
    markomEmployeeStats,
    markomBranchStats,
    markomNationalStats,
  ] = await Promise.all([
    getTodayAttendance(supabase, session.userId),
    getMonthlyStats(supabase, session.userId, new Date()),
    listRecentMemos(supabase, 5),
    listRecentAnnouncements(supabase, 5),
    canReviewRegistrations ? countPendingRegistrations(supabase) : Promise.resolve(0),
    isSales ? salesStatsAction() : Promise.resolve(null),
    canViewBranchCrm ? branchStatsAction() : Promise.resolve(null),
    canViewNationalCrm ? nationalStatsAction() : Promise.resolve(null),
    isMarkom ? markomEmployeeStatsAction() : Promise.resolve(null),
    canViewBranchMarkom ? markomBranchStatsAction() : Promise.resolve(null),
    canViewNationalMarkom ? markomNationalStatsAction() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Halo, ${session.employee.full_name.split(" ")[0]}`} description="Berikut ringkasan aktivitas Anda hari ini." />

      <ProfileSummaryCard employee={session.employee} />

      {canReviewRegistrations && <PendingRegistrationCard count={pendingRegistrationCount} />}

      {isSales && <SalesDashboardSection stats={salesStats} />}
      {canViewBranchCrm && <BranchDashboardSection stats={branchStats} />}
      {canViewOperationalCrm && <OperationalDashboardSection stats={nationalStats} />}
      {canViewExecutiveCrm && <ExecutiveDashboardSection stats={nationalStats} />}

      {isMarkom && <MarkomEmployeeDashboardSection stats={markomEmployeeStats} />}
      {canViewBranchMarkom && <MarkomBranchDashboardSection stats={markomBranchStats} />}
      {canViewNationalMarkom && <MarkomDirectorDashboardSection stats={markomNationalStats} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <CheckInOutCard userId={session.userId} attendance={attendance} />
            <QuickActions permissions={session.permissions} />
          </div>
          <AttendanceStatsCard stats={monthlyStats} />
        </div>
        <div className="space-y-6">
          <RecentMemoList memos={memos} />
          <RecentAnnouncementList announcements={announcements} />
        </div>
      </div>
    </div>
  );
}
