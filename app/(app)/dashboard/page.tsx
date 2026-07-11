import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AttendanceStatsCard } from "@/features/dashboard/components/attendance-stats-card";
import { AttendanceSummaryCard } from "@/features/dashboard/components/attendance-summary-card";
import { CrmDirectorSummaryCard } from "@/features/dashboard/components/crm-director-summary-card";
import { PayrollStatusCard } from "@/features/dashboard/components/payroll-status-card";
import { PendingApprovalsCard } from "@/features/dashboard/components/pending-approvals-card";
import { ProfileSummaryCard } from "@/features/dashboard/components/profile-summary-card";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentAnnouncementList } from "@/features/dashboard/components/recent-announcement-list";
import { RecentMemoList } from "@/features/dashboard/components/recent-memo-list";
import { CheckInOutCard } from "@/features/attendance/components/check-in-out-card";
import {
  branchStatsAction as crmBranchStatsAction,
  conversionAnalyticsAction,
  monthlyTrendAction,
  nationalStatsAction,
} from "@/features/crm/actions/crm-query.actions";
import { BranchPerformanceCard } from "@/features/crm/components/branch-performance-card";
import { ExecutiveDashboardSection } from "@/features/crm/components/executive-dashboard-section";
import { OperationalDashboardSection } from "@/features/crm/components/operational-dashboard-section";
import { teamStatsAction as markomTeamStatsAction } from "@/features/markom/actions/markom-query.actions";
import { TeamSummaryCard as MarkomTeamSummaryCard } from "@/features/markom/components/team-summary-card";
import { ROLE_KEYS } from "@/constants/rbac";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getCompanyAttendanceSummary, getMonthlyStats, getTodayAttendance } from "@/repositories/attendance.repository";
import { listRecentAnnouncements } from "@/repositories/announcement.repository";
import { countPendingRegistrations } from "@/repositories/employee.repository";
import { listRecentMemos } from "@/repositories/memo.repository";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard = Executive Summary ("how is the company performing"), scoped to
 * each role's own primary responsibility. Notifications live exclusively
 * behind the bell icon in the topnav (NotificationBell), never as a Home
 * Dashboard card. Markom widgets only appear here for the Markom role itself
 * (its own team, i.e. its primary responsibility) -- every other role,
 * including Super Admin, reaches Markom exclusively via the sidebar module.
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
  const isDirekturUtama = session.roleKey === ROLE_KEYS.DIREKTUR_UTAMA;
  const isDirekturOperasional = session.roleKey === ROLE_KEYS.DIREKTUR_OPERASIONAL;
  // Finance and Super Admin also satisfy isDirector (they hold crm_analytics.view_all
  // for other reasons) but keep the generic executive-summary treatment below --
  // only the two director roles get the pared-down, role-specific sections.
  const showGenericDirectorTier = isDirector && !isDirekturUtama && !isDirekturOperasional;
  // Branch Manager's primary responsibility is branch sales performance --
  // this widget comes first, above Markom, on their Home Dashboard.
  const canViewBranchCrm = hasPermission(session, "crm_analytics.view_branch");
  // Role-gated, not permission-gated: kpi_task.view_own is also held by Super
  // Admin, but Markom's team widget is only that role's actual primary job.
  const isMarkomRole = session.roleKey === ROLE_KEYS.MARKOM;

  const [
    attendance,
    monthlyStats,
    memos,
    announcements,
    pendingRegistrationCount,
    nationalStats,
    crmConversion,
    crmTrend,
    attendanceSummary,
    crmBranchStats,
    markomTeamStats,
  ] = await Promise.all([
    getTodayAttendance(supabase, session.userId),
    getMonthlyStats(supabase, session.userId, new Date()),
    listRecentMemos(supabase, 5),
    listRecentAnnouncements(supabase, 5),
    canReviewRegistrations ? countPendingRegistrations(supabase) : Promise.resolve(0),
    isDirector ? nationalStatsAction() : Promise.resolve(null),
    showGenericDirectorTier ? conversionAnalyticsAction() : Promise.resolve(null),
    showGenericDirectorTier ? monthlyTrendAction(6) : Promise.resolve([]),
    isDirector ? getCompanyAttendanceSummary(supabase) : Promise.resolve(null),
    canViewBranchCrm ? crmBranchStatsAction() : Promise.resolve(null),
    isMarkomRole ? markomTeamStatsAction() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Halo, ${session.employee.full_name.split(" ")[0]}`} description="Berikut ringkasan aktivitas Anda hari ini." />

      <ProfileSummaryCard employee={session.employee} />

      {isDirekturUtama && nationalStats && (
        <>
          <ExecutiveDashboardSection stats={nationalStats} />
          {attendanceSummary && <AttendanceSummaryCard summary={attendanceSummary} />}
        </>
      )}

      {isDirekturOperasional && nationalStats && (
        <>
          <OperationalDashboardSection stats={nationalStats} />
          <div className="grid gap-6 sm:grid-cols-2">
            {attendanceSummary && <AttendanceSummaryCard summary={attendanceSummary} />}
            <PendingApprovalsCard
              registrationCount={canReviewRegistrations ? pendingRegistrationCount : undefined}
              financeVerificationCount={nationalStats?.pending_finance_verification ?? 0}
            />
          </div>
        </>
      )}

      {showGenericDirectorTier && (
        <>
          {nationalStats && <CrmDirectorSummaryCard stats={nationalStats} conversion={crmConversion} trend={crmTrend} />}
          <div className="grid gap-6 sm:grid-cols-2">
            {attendanceSummary && <AttendanceSummaryCard summary={attendanceSummary} />}
            <PayrollStatusCard />
            <PendingApprovalsCard
              registrationCount={canReviewRegistrations ? pendingRegistrationCount : undefined}
              financeVerificationCount={nationalStats?.pending_finance_verification ?? 0}
            />
          </div>
        </>
      )}

      {/* Kepala Cabang: branch KPIs only -- no Sales Summary/ranking, no Markom, per Home Dashboard scope. */}
      {!isDirector && canViewBranchCrm && crmBranchStats && <BranchPerformanceCard stats={crmBranchStats} />}

      {isMarkomRole && <MarkomTeamSummaryCard stats={markomTeamStats} />}

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
