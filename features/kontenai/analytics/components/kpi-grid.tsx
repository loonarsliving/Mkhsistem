import { BarChart3, Eye, Percent, Target, TrendingUp, Users, Video, Zap } from "lucide-react";

import { StatTile } from "@/features/kontenai/components/stat-tile";
import type { AnalyticsKpis } from "@/features/kontenai/analytics/lib/aggregate";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(value));
}

/** Spec item 2 -- the 8 headline KPIs. */
export function KpiGrid({ kpis }: { kpis: AnalyticsKpis }) {
  const tiles = [
    { label: "Total Content", value: formatNumber(kpis.totalContent), icon: Video },
    { label: "Published Content", value: formatNumber(kpis.publishedContent), icon: Zap },
    { label: "Total Views", value: formatNumber(kpis.totalViews), icon: Eye },
    { label: "Reach", value: formatNumber(kpis.totalReach), icon: Users },
    { label: "Engagement Rate", value: `${kpis.engagementRate}%`, icon: TrendingUp },
    { label: "CTR", value: kpis.avgCtr !== null ? `${kpis.avgCtr}%` : "-", icon: Target },
    { label: "Leads", value: kpis.totalLeads !== null ? formatNumber(kpis.totalLeads) : "-", icon: BarChart3 },
    { label: "Conversion Rate", value: kpis.conversionRate !== null ? `${kpis.conversionRate}%` : "-", icon: Percent },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((tile) => (
        <StatTile key={tile.label} {...tile} />
      ))}
    </div>
  );
}
