import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AttendanceHistoryTable } from "@/features/attendance/components/attendance-history-table";
import { MyLeaveRequestList, PendingLeaveApprovalList } from "@/features/attendance/components/leave-request-list";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Riwayat Kehadiran" };

export default async function AttendanceHistoryPage() {
  const session = await requireSession();
  const canViewOthers = hasPermission(session, "attendance.view_branch") || hasPermission(session, "attendance.view_all");
  const canManage = hasPermission(session, "attendance.manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Riwayat Kehadiran" description="Lihat, filter, dan ekspor riwayat kehadiran." />

      {canManage && <PendingLeaveApprovalList />}

      <AttendanceHistoryTable showEmployeeColumn={canViewOthers} />

      {!canViewOthers && <MyLeaveRequestList />}
    </div>
  );
}
