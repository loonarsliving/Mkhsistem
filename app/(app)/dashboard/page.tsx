import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AttendanceStatsCard } from "@/features/dashboard/components/attendance-stats-card";
import { ConstructionSaldoCard } from "@/features/construction-finance/components/construction-saldo-card";
import { ConstructionTargetCard } from "@/features/construction-finance/components/construction-target-card";
import { LoonarsFeeCard } from "@/features/dashboard/components/loonars-fee-card";
import { ProfileSummaryCard } from "@/features/dashboard/components/profile-summary-card";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentAnnouncementList } from "@/features/dashboard/components/recent-announcement-list";
import { RecentMemoList } from "@/features/dashboard/components/recent-memo-list";
import { AllBranchBalancesSection } from "@/features/dashboard/components/sections/all-branch-balances-section";
import { BranchDashboardSection } from "@/features/dashboard/components/sections/branch-dashboard-section";
import {
  DirekturOperasionalSection,
  DirekturUtamaSection,
  GenericDirectorSection,
} from "@/features/dashboard/components/sections/executive-dashboard-sections";
import { MarkomDashboardSection } from "@/features/dashboard/components/sections/markom-dashboard-section";
import { SalesDashboardSection } from "@/features/dashboard/components/sections/sales-dashboard-section";
import { SiteplanFeeCard } from "@/features/siteplan/components/unit-fee-card";
import { CheckInOutCard } from "@/features/attendance/components/check-in-out-card";
import { AiHealthStatusCard } from "@/features/monitoring/components/ai-health-status-card";
import { MetaHealthStatusCard } from "@/features/monitoring/components/meta-health-status-card";
import { TikTokHealthStatusCard } from "@/features/monitoring/components/tiktok-health-status-card";
import { WhatsAppHealthStatusCard } from "@/features/monitoring/components/whatsapp-health-status-card";
import { PERMISSIONS, ROLE_KEYS } from "@/constants/rbac";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getMonthlyStats, getTodayAttendance } from "@/repositories/attendance.repository";
import { listRecentAnnouncements } from "@/repositories/announcement.repository";
import { getActiveConstructionProject, getActiveConstructionTarget } from "@/repositories/construction-finance.repository";
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
 *
 * Only cheap, always-needed queries run in the server-side Promise.all
 * below (today's attendance, this month's stats, memos/announcements,
 * pending registration count). Every heavier, role-gated analytics query
 * (CRM national/branch/sales stats, conversion, trend, branch balances,
 * company attendance summary) fetches client-side inside its own section
 * component instead -- see features/dashboard/components/sections -- so
 * the page shell renders immediately rather than waiting on ~10 extra
 * Supabase round-trips that only some roles even need.
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
  // Kendari's Kepala Cabang has a deliberately reduced menu (dashboard +
  // construction finance only, see KENDARI_KEPALA_CABANG_ALLOWED_PERMISSIONS)
  // -- the saldo needs to be front and center on Home since there's little
  // else on this page for that account.
  const canViewConstructionFinance = hasPermission(session, PERMISSIONS.CONSTRUCTION_FINANCE_VIEW_OWN);

  const [attendance, monthlyStats, memos, announcements, pendingRegistrationCount, constructionProject, constructionTarget] = await Promise.all([
    getTodayAttendance(supabase, session.userId),
    getMonthlyStats(supabase, session.userId, new Date()),
    listRecentMemos(supabase, 5),
    listRecentAnnouncements(supabase, 5),
    canReviewRegistrations ? countPendingRegistrations(supabase) : Promise.resolve(0),
    canViewConstructionFinance && session.employee.branch_id
      ? getActiveConstructionProject(supabase, session.employee.branch_id)
      : Promise.resolve(null),
    canViewConstructionFinance && session.employee.branch_id
      ? getActiveConstructionTarget(supabase, session.employee.branch_id)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Halo, ${session.employee.full_name.split(" ")[0]}`} description="Berikut ringkasan aktivitas Anda hari ini." />

      <ProfileSummaryCard employee={session.employee} />

      {constructionProject && <ConstructionSaldoCard project={constructionProject} />}

      {constructionTarget && <ConstructionTargetCard target={constructionTarget} />}

      <LoonarsFeeCard />

      <SiteplanFeeCard />

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

          <SalesDashboardSection userId={session.userId} />
        </>
      )}

      {isDirekturUtama && <DirekturUtamaSection />}

      {isDirekturOperasional && (
        <DirekturOperasionalSection registrationCount={canReviewRegistrations ? pendingRegistrationCount : undefined} />
      )}

      {showGenericDirectorTier && (
        <GenericDirectorSection registrationCount={canReviewRegistrations ? pendingRegistrationCount : undefined} />
      )}

      {isDirector && <AllBranchBalancesSection />}

      {/* Kepala Cabang: branch KPIs only -- no Sales Summary/ranking, no Markom, per Home Dashboard scope. */}
      {!isDirector && canViewBranchCrm && <BranchDashboardSection branchId={session.employee.branch_id} />}

      {isMarkomRole && <MarkomDashboardSection />}

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
