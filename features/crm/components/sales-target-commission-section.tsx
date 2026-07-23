import Link from "next/link";
import { CheckCircle2, Coins, Plus, Target, TrendingUp, Wallet } from "lucide-react";

import { RevenueTile } from "@/components/shared/revenue-tile";
import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { salesStatsAction } from "../actions/crm-query.actions";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

/**
 * The most prominent section on the Sales Home Dashboard, right below the
 * profile card -- target progress and commission earnings, the two figures
 * a Sales rep should see first every time they log in. All figures come
 * straight from crm_sales_stats (same RPC, same numbers as the CRM Sales
 * Detail page and the old unwired SalesDashboardSection) -- no new
 * calculation. "Komisi Terverifikasi (Siap Dibayar)" reflects payments whose
 * deal has reached Closing and is locked in for payout; MK Connect does not
 * separately track actual payroll disbursement back onto this figure.
 */
export function SalesTargetCommissionSection({ stats }: { stats: Awaited<ReturnType<typeof salesStatsAction>> }) {
  if (!stats) return null;

  const pendingCommission = Math.max(stats.estimated_commission - stats.verified_commission, 0);

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Target &amp; Komisi Bulan Ini</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-primary">
            <TrendingUp className="h-4 w-4" />
            <span className="text-lg font-bold tabular-nums">{stats.achievement_percent}%</span>
            <span className="text-xs font-medium">Achievement</span>
          </div>
          <Button asChild size="sm">
            <Link href="/crm/new">
              <Plus className="h-4 w-4" /> Tambah Prospek
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <SectionLabel>Target</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={Target} label="Target Unit Bulan Ini" value={String(stats.target_units)} />
            <StatTile icon={CheckCircle2} label="Closing Unit" value={String(stats.closing_units)} tone="success" />
            <StatTile icon={Target} label="Sisa Target" value={String(stats.remaining_target)} tone="warning" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <RevenueTile icon={Wallet} label="Target Revenue" value={formatCurrency(stats.target_revenue)} />
            <RevenueTile icon={Wallet} label="Revenue Terealisasi" value={formatCurrency(stats.collection)} tone="success" />
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Komisi Saya</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <RevenueTile icon={Coins} label="Total Komisi Diperoleh" value={formatCurrency(stats.estimated_commission)} tone="success" />
            <RevenueTile icon={Coins} label="Komisi Pending" value={formatCurrency(pendingCommission)} tone="warning" />
            <RevenueTile icon={Coins} label="Komisi Terverifikasi (Siap Dibayar)" value={formatCurrency(stats.verified_commission)} tone="success" />
            <RevenueTile icon={Coins} label="Estimasi Komisi Jika Target Tercapai" value={formatCurrency(stats.max_commission)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
