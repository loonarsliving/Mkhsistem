import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Coins,
  Percent,
  Plus,
  Target,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { salesStatsAction } from "../actions/crm-query.actions";

import { StatTile } from "./stat-tile";

export function SalesDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof salesStatsAction>> }) {
  if (!stats) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">CRM — Ringkasan Sales</CardTitle>
        <Button asChild size="sm">
          <Link href="/crm/new">
            <Plus className="h-4 w-4" /> Tambah Prospect
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile icon={ClipboardList} label="Prospect Hari Ini" value={String(stats.today_prospect)} />
          <StatTile icon={Target} label="Target Unit" value={String(stats.target_units)} />
          <StatTile icon={Wallet} label="Target Revenue" value={formatCurrency(stats.target_revenue)} />
          <StatTile icon={CheckCircle2} label="Unit Tercapai" value={String(stats.closing_units)} tone="success" />
          <StatTile icon={Wallet} label="Revenue Tercapai" value={formatCurrency(stats.collection)} tone="success" />
          <StatTile icon={Percent} label="Achievement" value={`${stats.achievement_percent}%`} tone="success" />
          <StatTile icon={Coins} label="Estimasi Komisi" value={formatCurrency(stats.commission)} tone="success" />
          <StatTile icon={Coins} label="Komisi Maksimal" value={formatCurrency(stats.max_commission)} />
          <StatTile icon={Target} label="Sisa Target" value={String(stats.remaining_target)} tone="warning" />
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
