import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AttendanceStatsCard } from "@/features/dashboard/components/attendance-stats-card";
import { AttendanceSummaryCard } from "@/features/dashboard/components/attendance-summary-card";
import { CrmDirectorSummaryCard } from "@/features/dashboard/components/crm-director-summary-card";
import { PayrollStatusCard } from "@/features/dashboard/components/payroll-status-card";
import { PendingApprovalsCard } from "@/features/dashboard/components/pending-approvals-card";
import { PendingRegistrationCard } from "@/features/dashboard/components/pending-registration-card";
import { ProfileSummaryCard } from "@/features/dashboard/components/profile-summary-card";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentAnnouncementList } from "@/features/dashboard/components/recent-announcement-list";
import { RecentMemoList } from "@/features/dashboard/components/recent-memo-list";
import { RecentNotificationsCard } from "@/features/dashboard/components/recent-notifications-card";
import { CheckInOutCard } from "@/features/attendance/components/check-in-out-card";
import { conversionAnalyticsAction, monthlyTrendAction, nationalStatsAction } from "@/features/crm/actions/crm-query.actions";
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
import { getCompanyAttendanceSummary, getMonthlyStats, getTodayAttendance } from "@/repositories/attendance.repository";
import { listRecentAnnouncements } from "@/repositories/announcement.repository";
import { countPendingRegistrations } from "@/repositories/employee.repository";
import { listRecentMemos } from "@/repositories/memo.repository";
import { listNotifications } from "@/repositories/notification.repository";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard = Executive Summary ("how is the company performing"), never an
 * operational CRM surface. The ONLY CRM element allowed here is
 * CrmDirectorSummaryCard -- one card, one shortcut into /crm/dashboard.
 * Everything operational (Sales Summary, Branch Summary, prospect funnels,
 * rankings, customer tables, analytics) lives exclusively in the CRM module.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const canReviewRegistrations =
    hasPermission(session, "registration.view_all") || hasPermission(session, "registration.view_branch");
  // Direktur Utama and Direktur Operasional both hold crm_analytics.view_all
  // (needed elsewhere, e.g. the CRM module); either permission qualifies
  // for the Executive Summary section here.
  const isDirector = hasPermission(session, "crm_analytics.view_all") || hasPermission(session, "crm_analytics.view_executive");
  const isMarkom = hasPermission(session, "kpi_task.view_own");
  const canViewBranchMarkom = hasPermission(session, "kpi_task.view_branch");
  const canViewNationalMarkom = hasPermission(session, "kpi_task.view_all");

  const [
    attendance,
    monthlyStats,
    memos,
    announcements,
    notifications,
    pendingRegistrationCount,
    nationalStats,
    crmConversion,
    crmTrend,
    attendanceSummary,
    markomEmployeeStats,
    markomBranchStats,
    markomNationalStats,
  ] = await Promise.all([
    getTodayAttendance(supabase, session.userId),
    getMonthlyStats(supabase, session.userId, new Date()),
    listRecentMemos(supabase, 5),
    listRecentAnnouncements(supabase, 5),
    listNotifications(supabase, session.userId, 1),
    canReviewRegistrations ? countPendingRegistrations(supabase) : Promise.resolve(0),
    isDirector ? nationalStatsAction() : Promise.resolve(null),
    isDirector ? conversionAnalyticsAction() : Promise.resolve(null),
    isDirector ? monthlyTrendAction(6) : Promise.resolve([]),
    isDirector ? getCompanyAttendanceSummary(supabase) : Promise.resolve(null),
    isMarkom ? markomEmployeeStatsAction() : Promise.resolve(null),
    canViewBranchMarkom ? markomBranchStatsAction() : Promise.resolve(null),
    canViewNationalMarkom ? markomNationalStatsAction() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Halo, ${session.employee.full_name.split(" ")[0]}`} description="Berikut ringkasan aktivitas Anda hari ini." />

      <ProfileSummaryCard employee={session.employee} />

      {isDirector && nationalStats && (
        <CrmDirectorSummaryCard stats={nationalStats} conversion={crmConversion} trend={crmTrend} />
      )}

      {isDirector ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {attendanceSummary && <AttendanceSummaryCard summary={attendanceSummary} />}
          <PayrollStatusCard />
          <PendingApprovalsCard
            registrationCount={canReviewRegistrations ? pendingRegistrationCount : undefined}
            financeVerificationCount={nationalStats?.pending_finance_verification ?? 0}
          />
          <RecentNotificationsCard notifications={notifications.items} />
        </div>
      ) : (
        canReviewRegistrations && <PendingRegistrationCard count={pendingRegistrationCount} />
      )}

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
          {!isDirector && <RecentNotificationsCard notifications={notifications.items} />}
          <RecentMemoList memos={memos} />
          <RecentAnnouncementList announcements={announcements} />
        </div>
      </div>
    </div>
  );
}
