import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AttendanceStatsCard } from "@/features/dashboard/components/attendance-stats-card";
import { AttendanceSummaryCard } from "@/features/dashboard/components/attendance-summary-card";
import { AllBranchBalancesCard, BranchBalanceCard } from "@/features/dashboard/components/branch-balance-card";
import { CrmDirectorSummaryCard } from "@/features/dashboard/components/crm-director-summary-card";
import { PayrollStatusCard } from "@/features/dashboard/components/payroll-status-card";
import { PendingApprovalsCard } from "@/features/dashboard/components/pending-approvals-card";
import { ProfileSummaryCard } from "@/features/dashboard/components/profile-summary-card";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentAnnouncementList } from "@/features/dashboard/components/recent-announcement-list";
import { RecentMemoList } from "@/features/dashboard/components/recent-memo-list";
import { CheckInOutCard } from "@/features/attendance/components/check-in-out-card";
import { AiHealthStatusCard } from "@/features/monitoring/components/ai-health-status-card";
import { MetaHealthStatusCard } from "@/features/monitoring/components/meta-health-status-card";
import { TikTokHealthStatusCard } from "@/features/monitoring/components/tiktok-health-status-card";
import { WhatsAppHealthStatusCard } from "@/features/monitoring/components/whatsapp-health-status-card";
import {
  branchStatsAction as crmBranchStatsAction,
  conversionAnalyticsAction,
  listRecentFollowUpsBySalesAction,
  monthlyTrendAction,
  nationalStatsAction,
  salesStatsAction,
} from "@/features/crm/actions/crm-query.actions";
import { BranchPerformanceCard } from "@/features/crm/components/branch-performance-card";
import { ExecutiveDashboardSection } from "@/features/crm/components/executive-dashboard-section";
import { OperationalDashboardSection } from "@/features/crm/components/operational-dashboard-section";
import { RecentProspectActivityCard } from "@/features/crm/components/recent-prospect-activity-card";
import { SalesCrmActivityCard } from "@/features/crm/components/sales-crm-activity-card";
import { SalesTargetCommissionSection } from "@/features/crm/components/sales-target-commission-section";
import { teamStatsAction as markomTeamStatsAction } from "@/features/markom/actions/markom-query.actions";
import { TeamSummaryCard as MarkomTeamSummaryCard } from "@/features/markom/components/team-summary-card";
import { ROLE_KEYS } from "@/constants/rbac";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getCompanyAttendanceSummary, getMonthlyStats, getTodayAttendance } from "@/repositories/attendance.repository";
import { listRecentAnnouncements } from "@/repositories/announcement.repository";
import { countPendingRegistrations } from "@/repositories/employee.repository";
import { getBranchBalance, listBranchBalances } from "@/repositories/finance-branch-balance.repository";
import { listRecentMemos } from "@/repositories/memo.repository";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Must match BALANCE_ALERT_THRESHOLD in app/api/ai/branch-balance-advisory/
 * route.ts -- a placeholder pending real per-branch payroll/operating-cost
 * data (see 0098_finance_expense_alerts_and_branch_balance.sql).
 */
const BALANCE_ALERT_THRESHOLD = 15_000_000;

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
  const isSalesRole = session.roleKey === ROLE_KEYS.SALES;
  const isSuperAdmin = session.roleKey === ROLE_KEYS.SUPER_ADMIN;

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
    salesStats,
    recentProspectActivity,
    branchBalance,
    allBranchBalances,
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
    isSalesRole ? salesStatsAction() : Promise.resolve(null),
    isSalesRole ? listRecentFollowUpsBySalesAction(session.userId, 8) : Promise.resolve([]),
    !isDirector && canViewBranchCrm && session.employee.branch_id
      ? getBranchBalance(supabase, session.employee.branch_id)
      : Promise.resolve(null),
    isDirector ? listBranchBalances(supabase) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Halo, ${session.employee.full_name.split(" ")[0]}`} description="Berikut ringkasan aktivitas Anda hari ini." />

      <ProfileSummaryCard employee={session.employee} />

      {isSuperAdmin && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Status Koneksi Sistem</p>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/monitoring">
                Detail Monitoring <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AiHealthStatusCard />
            <WhatsAppHealthStatusCard />
            <MetaHealthStatusCard />
            <TikTokHealthStatusCard />
          </div>
        </div>
      )}

      {isSalesRole && (
        <>
          {/* Sales Home Dashboard order: Profile -> Target & Commission -> Memo/Announcement -> Attendance -> CRM Activity -> Recent Prospect Activity. */}
          <SalesTargetCommissionSection stats={salesStats} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6">
              <RecentMemoList memos={memos} />
              <RecentAnnouncementList announcements={announcements} />
            </div>
            <div className="space-y-6 lg:col-span-2">
              <div className="grid gap-6 sm:grid-cols-2">
                <CheckInOutCard userId={session.userId} attendance={attendance} />
                <QuickActions permissions={session.permissions} />
              </div>
              <AttendanceStatsCard stats={monthlyStats} />
            </div>
          </div>

          <SalesCrmActivityCard stats={salesStats} />
          <RecentProspectActivityCard activities={recentProspectActivity as unknown as Parameters<typeof RecentProspectActivityCard>[0]["activities"]} />
        </>
      )}

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

      {isDirector && allBranchBalances.length > 0 && (
        <AllBranchBalancesCard balances={allBranchBalances} alertThreshold={BALANCE_ALERT_THRESHOLD} />
      )}

      {/* Kepala Cabang: branch KPIs only -- no Sales Summary/ranking, no Markom, per Home Dashboard scope. */}
      {!isDirector && canViewBranchCrm && crmBranchStats && <BranchPerformanceCard stats={crmBranchStats} />}
      {!isDirector && canViewBranchCrm && branchBalance && (
        <BranchBalanceCard balance={branchBalance} alertThreshold={BALANCE_ALERT_THRESHOLD} />
      )}

      {isMarkomRole && <MarkomTeamSummaryCard stats={markomTeamStats} />}

      {!isSalesRole && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <RecentMemoList memos={memos} />
            <RecentAnnouncementList announcements={announcements} />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <div className="grid gap-6 sm:grid-cols-2">
              <CheckInOutCard userId={session.userId} attendance={attendance} />
              <QuickActions permissions={session.permissions} />
            </div>
            <AttendanceStatsCard stats={monthlyStats} />
          </div>
        </div>
      )}
    </div>
  );
}
