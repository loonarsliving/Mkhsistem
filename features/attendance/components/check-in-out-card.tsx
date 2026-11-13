"use client";

import * as React from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceStatusBadge } from "@/components/shared/status-badge";
import type { AttendanceStatus } from "@/constants/app";
import type { CurrentAttendance } from "@/repositories/attendance.repository";

import { CheckInOutDialog } from "./check-in-out-dialog";

export function CheckInOutCard({ userId, attendance }: { userId: string; attendance: CurrentAttendance | null }) {
  const [dialogMode, setDialogMode] = React.useState<"check-in" | "check-out" | null>(null);

  const checkedIn = Boolean(attendance?.check_in_time);
  const checkedOut = Boolean(attendance?.check_out_time);
  // Night shift that started on an earlier date and is still open (see
  // lib/attendance/current-shift.ts): check-out closes that shift; a new
  // check-in for today stays possible in case the old shift was forgotten.
  const carriedOver = Boolean(attendance?.carried_over);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Absensi Hari Ini</CardTitle>
        {attendance && <AttendanceStatusBadge status={attendance.status as AttendanceStatus} />}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <TimeSlot label="Jam Masuk" time={attendance?.check_in_time ?? null} />
          <TimeSlot label="Jam Pulang" time={attendance?.check_out_time ?? null} />
        </div>

        {carriedOver && attendance && (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
            Shift {format(new Date(attendance.check_in_time!), "EEEE, d MMM HH:mm", { locale: idLocale })} belum
            check-out. Check out untuk menutup shift itu.
          </p>
        )}

        {!checkedIn && (
          <Button className="w-full" onClick={() => setDialogMode("check-in")}>
            <LogIn className="h-4 w-4" /> Check In
          </Button>
        )}
        {checkedIn && !checkedOut && (
          <Button className="w-full" variant="secondary" onClick={() => setDialogMode("check-out")}>
            <LogOut className="h-4 w-4" /> Check Out
          </Button>
        )}
        {carriedOver && (
          <Button className="w-full" variant="outline" onClick={() => setDialogMode("check-in")}>
            <LogIn className="h-4 w-4" /> Mulai shift baru hari ini
          </Button>
        )}
        {checkedIn && checkedOut && (
          <div className="flex items-center justify-center gap-2 rounded-md bg-success/10 py-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" /> Absensi hari ini selesai
          </div>
        )}
      </CardContent>

      {dialogMode && (
        <CheckInOutDialog
          mode={dialogMode}
          userId={userId}
          open={Boolean(dialogMode)}
          onOpenChange={(open) => !open && setDialogMode(null)}
        />
      )}
    </Card>
  );
}

function TimeSlot({ label, time }: { label: string; time: string | null }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {time ? format(new Date(time), "HH:mm", { locale: idLocale }) : "--:--"}
      </p>
    </div>
  );
}
