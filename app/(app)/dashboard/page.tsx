import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AttendanceStatsCard } from "@/features/dashboard/components/attendance-stats-card";
import { ProfileSummaryCard } from "@/features/dashboard/components/profile-summary-card";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentAnnouncementList } from "@/features/dashboard/components/recent-announcement-list";
import { RecentMemoList } from "@/features/dashboard/components/recent-memo-list";
import { CheckInOutCard } from "@/features/attendance/components/check-in-out-card";
import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getMonthlyStats, getTodayAttendance } from "@/repositories/attendance.repository";
import { listRecentAnnouncements } from "@/repositories/announcement.repository";
import { listRecentMemos } from "@/repositories/memo.repository";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const [attendance, monthlyStats, memos, announcements] = await Promise.all([
    getTodayAttendance(supabase, session.userId),
    getMonthlyStats(supabase, session.userId, new Date()),
    listRecentMemos(supabase, 5),
    listRecentAnnouncements(supabase, 5),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Halo, ${session.employee.full_name.split(" ")[0]}`} description="Berikut ringkasan aktivitas Anda hari ini." />

      <ProfileSummaryCard employee={session.employee} />

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
