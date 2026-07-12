import Link from "next/link";
import { AlarmClock, CalendarClock, ClipboardList, Plus } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { salesStatsAction } from "../actions/crm-query.actions";

/** CRM Activity section of the Sales Home Dashboard -- today's pipeline counters, unchanged from crm_sales_stats. */
export function SalesCrmActivityCard({ stats }: { stats: Awaited<ReturnType<typeof salesStatsAction>> }) {
  if (!stats) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Aktivitas CRM</CardTitle>
        <Button asChild size="sm">
          <Link href="/crm/new">
            <Plus className="h-4 w-4" /> Tambah Prospect
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={ClipboardList} label="Prospect Hari Ini" value={String(stats.today_prospect)} />
          <StatTile icon={CalendarClock} label="Follow Up Hari Ini" value={String(stats.today_follow_up)} />
          <StatTile
            icon={AlarmClock}
            label="Follow Up Terlambat"
            value={String(stats.late_follow_up)}
            tone={stats.late_follow_up > 0 ? "destructive" : "default"}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">Baru {stats.prospects_red}</span>
          <span className="rounded-full bg-warning/10 px-3 py-1 font-medium text-warning">Follow Up {stats.prospects_yellow}</span>
          <span className="rounded-full bg-success/10 px-3 py-1 font-medium text-success">Verifikasi {stats.prospects_green}</span>
          <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Closing {stats.prospects_closing}</span>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/crm">Lihat Semua Prospect</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
