"use client";

import * as React from "react";

import { AttendanceStatusBadge } from "@/components/shared/status-badge";
import type { AttendanceStatus } from "@/constants/app";
import { getInitials } from "@/lib/utils";

import { AttendanceDetailDialog } from "./attendance-detail-dialog";

interface BranchTodayRow {
  user_id: string;
  full_name: string;
  branch_name: string;
  status: string | null;
  attendance_id: string | null;
}

/** "Kehadiran Tim Hari Ini" list on the Attendance page -- clickable for members who have already checked in, opening the same location+photo detail dialog as the History table. */
export function BranchTodayList({ rows }: { rows: BranchTodayRow[] }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.user_id}
            className={`flex items-center justify-between gap-3 py-2.5 ${row.attendance_id ? "cursor-pointer" : ""}`}
            onClick={() => row.attendance_id && setSelectedId(row.attendance_id)}
          >
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
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada data karyawan</p>}
      </ul>

      <AttendanceDetailDialog attendanceId={selectedId} open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)} />
    </>
  );
}
