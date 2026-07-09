import type { Metadata } from "next";
import Link from "next/link";
import { History, Settings2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { AttendanceStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckInOutCard } from "@/features/attendance/components/check-in-out-card";
import { LeaveRequestDialog } from "@/features/attendance/components/leave-request-dialog";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getBranchTodaySummary, getTodayAttendance } from "@/repositories/attendance.repository";
import { getInitials } from "@/lib/utils";
import type { AttendanceStatus } from "@/constants/app";

export const metadata: Metadata = { title: "Absensi" };

export default async function AttendancePage() {
  const session = await requireSession();
  const supabase = await createClient();

  const canViewBranch = hasPermission(session, "attendance.view_branch") || hasPermission(session, "attendance.view_all");

  const [attendance, branchSummary] = await Promise.all([
    getTodayAttendance(supabase, session.userId),
    canViewBranch
      ? getBranchTodaySummary(supabase, hasPermission(session, "attendance.view_all") ? undefined : session.employee.branch_id)
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Absensi"
        description="Kelola kehadiran harian Anda."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/attendance/history">
                <History className="h-4 w-4" /> Riwayat
              </Link>
            </Button>
            {hasPermission(session, "attendance.settings_manage") && (
              <Button variant="outline" asChild>
                <Link href="/attendance/settings">
                  <Settings2 className="h-4 w-4" /> Pengaturan
                </Link>
              </Button>
            )}
            <LeaveRequestDialog />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <CheckInOutCard userId={session.userId} attendance={attendance} />
        </div>

        {canViewBranch && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Kehadiran Tim Hari Ini</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {branchSummary.map((row) => (
                  <li key={row.user_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {getInitials(row.full_name)}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{row.full_name}</p>
                        <p className="text-xs text-muted-foreground">{row.branch_name}</p>
                      </div>
                    </div>
                    {row.status ? (
                      <AttendanceStatusBadge status={row.status as AttendanceStatus} />
                    ) : (
                      <span className="text-xs text-muted-foreground">Belum absen</span>
                    )}
                  </li>
                ))}
                {branchSummary.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada data karyawan</p>
                )}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
