"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LEAD_SOURCE_LABEL } from "@/constants/app";
import type { LeadSource } from "@/constants/app";

interface LeadSourceRow {
  lead_source: LeadSource;
  total: number;
  closing: number;
  conversion_percent: number;
}

export function LeadSourceChart({ data }: { data: LeadSourceRow[] }) {
  const chartData = data.map((row) => ({
    name: LEAD_SOURCE_LABEL[row.lead_source] ?? row.lead_source,
    total: row.total,
    closing: row.closing,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lead Source Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" name="Total Prospect" fill="hsl(221 83% 60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="closing" name="Closing" fill="hsl(142 71% 35%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
