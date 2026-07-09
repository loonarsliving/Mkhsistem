"use client";

import * as React from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceStatusBadge } from "@/components/shared/status-badge";
import type { AttendanceStatus } from "@/constants/app";
import type { Attendance } from "@/types/domain";

import { CheckInOutDialog } from "./check-in-out-dialog";

export function CheckInOutCard({ userId, attendance }: { userId: string; attendance: Attendance | null }) {
  const [dialogMode, setDialogMode] = React.useState<"check-in" | "check-out" | null>(null);

  const checkedIn = Boolean(attendance?.check_in_time);
  const checkedOut = Boolean(attendance?.check_out_time);

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
