"use client";

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

interface MonthlyTrendRow {
  period_month: number;
  period_year: number;
  target_units: number;
  closing_units: number;
  achievement_percent: number;
  collection: number;
}

export function MonthlyTrendChart({ data }: { data: MonthlyTrendRow[] }) {
  const chartData = data.map((row) => ({
    name: `${MONTH_LABEL[row.period_month - 1]} ${String(row.period_year).slice(2)}`,
    achievement: row.achievement_percent,
    collection: row.collection,
    closing: row.closing_units,
    target: row.target_units,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis yAxisId="left" fontSize={12} unit="%" />
                <YAxis yAxisId="right" orientation="right" fontSize={12} tickFormatter={(v: number) => formatCurrency(v)} width={90} />
                <Tooltip
                  formatter={(value: number, key: string) => (key === "collection" ? formatCurrency(value) : `${value}%`)}
                />
                <Line yAxisId="left" type="monotone" dataKey="achievement" name="Achievement" stroke="hsl(221 83% 60%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="collection" name="Collection" stroke="hsl(142 71% 35%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
