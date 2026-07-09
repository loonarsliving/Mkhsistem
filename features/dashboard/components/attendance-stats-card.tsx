"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ATTENDANCE_STATUS_LABEL } from "@/constants/app";
import type { AttendanceMonthlyStats } from "@/types/domain";

const COLORS = {
  hadir: "hsl(142 71% 35%)",
  terlambat: "hsl(38 92% 45%)",
  izin: "hsl(221 83% 60%)",
  sakit: "hsl(262 60% 60%)",
  alpha: "hsl(0 72% 51%)",
};

export function AttendanceStatsCard({ stats }: { stats: AttendanceMonthlyStats | null }) {
  const data = stats
    ? [
        { key: "hadir", value: stats.hadir_count },
        { key: "terlambat", value: stats.terlambat_count },
        { key: "izin", value: stats.izin_count },
        { key: "sakit", value: stats.sakit_count },
        { key: "alpha", value: stats.alpha_count },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Statistik Kehadiran Bulan Ini</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data kehadiran bulan ini</p>
        ) : (
          <div className="flex items-center gap-6">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="key" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {data.map((entry) => (
                      <Cell key={entry.key} fill={COLORS[entry.key as keyof typeof COLORS]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, ATTENDANCE_STATUS_LABEL[name as keyof typeof ATTENDANCE_STATUS_LABEL]]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-2">
              {data.map((entry) => (
                <li key={entry.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[entry.key as keyof typeof COLORS] }} />
                    {ATTENDANCE_STATUS_LABEL[entry.key as keyof typeof ATTENDANCE_STATUS_LABEL]}
                  </span>
                  <span className="font-medium tabular-nums">{entry.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
