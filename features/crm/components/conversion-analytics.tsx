"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { StatTile } from "@/components/shared/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LEAD_SOURCE_LABEL } from "@/constants/app";
import type { LeadSource } from "@/constants/app";

import { conversionAnalyticsAction } from "../actions/crm-query.actions";
import { Percent, TrendingUp, Users } from "lucide-react";

interface LeadSourceRow {
  lead_source: LeadSource;
  total: number;
  closing: number;
  conversion_percent: number;
}

export function ConversionAnalytics() {
  const { data } = useQuery({ queryKey: ["crm-conversion-analytics"], queryFn: () => conversionAnalyticsAction() });
  if (!data) return null;

  const leadSourceData = ((data.lead_source_performance ?? []) as unknown as LeadSourceRow[]).map((row) => ({
    name: LEAD_SOURCE_LABEL[row.lead_source] ?? row.lead_source,
    total: row.total,
    closing: row.closing,
    conversion: row.conversion_percent,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Users} label="Total Prospect" value={String(data.total_prospects)} />
        <StatTile icon={TrendingUp} label="Total Closing" value={String(data.total_closing)} tone="success" />
        <StatTile icon={Percent} label="Konversi" value={`${data.conversion_percent}%`} />
        <StatTile
          icon={Percent}
          label="Rata-rata Hari Follow Up Pertama"
          value={data.avg_follow_up_days !== null ? `${data.avg_follow_up_days} hari` : "-"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performa Sumber Prospect</CardTitle>
        </CardHeader>
        <CardContent>
          {leadSourceData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadSourceData}>
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
    </div>
  );
}
