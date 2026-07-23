import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyAttendanceSummary } from "@/repositories/attendance.repository";

const ROWS: { key: keyof CompanyAttendanceSummary; label: string; dotClass: string }[] = [
  { key: "hadir", label: "Hadir", dotClass: "bg-success" },
  { key: "terlambat", label: "Terlambat", dotClass: "bg-warning" },
  { key: "izin", label: "Izin", dotClass: "bg-primary" },
  { key: "sakit", label: "Sakit", dotClass: "bg-purple-500" },
  { key: "alpha", label: "Alpha", dotClass: "bg-destructive" },
  { key: "belumAbsen", label: "Belum Absen", dotClass: "bg-muted-foreground" },
];

export function AttendanceSummaryCard({ summary }: { summary: CompanyAttendanceSummary }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4" /> Attendance Summary
        </CardTitle>
        <Link href="/attendance/history" className="text-sm text-primary hover:underline">
          Lihat detail
        </Link>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">{summary.total} karyawan hari ini</p>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {ROWS.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${row.dotClass}`} />
                {row.label}
              </span>
              <span className="font-medium tabular-nums">{summary[row.key]}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
