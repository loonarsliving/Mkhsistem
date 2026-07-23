"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PerformancePeriodPoint } from "@/features/kontenai/analytics/lib/aggregate";

/** Spec item 3 -- performance-over-time chart, bucketed by ISO week. */
export function PerformanceChart({ data }: { data: PerformancePeriodPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Performa per Periode</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data performa untuk ditampilkan.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="views" name="Views" fill="hsl(221 83% 60%)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="engagement" name="Engagement" stroke="hsl(142 71% 35%)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
