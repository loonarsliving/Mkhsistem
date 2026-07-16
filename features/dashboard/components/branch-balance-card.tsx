import { AlertTriangle, Wallet } from "lucide-react";

import { RevenueTile } from "@/components/shared/revenue-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { BranchBalance, BranchSituationType } from "@/repositories/finance-branch-balance.repository";

const SITUATION_LABEL: Record<BranchSituationType, string> = {
  cash_low: "Saldo di bawah ambang batas",
  no_project: "Belum ada proyek dibuka",
  no_sales: "Belum ada penjualan sejak proyek dibuka",
};

/**
 * Kepala Cabang's own branch cash position, synced live from MKH Property
 * (Finance). Branch-scoped by RLS on finance_branch_balances (mirrors the
 * crm_analytics.view_branch pattern BranchPerformanceCard already uses) --
 * this component only ever receives the caller's own branch row.
 */
export function BranchBalanceCard({ balance }: { balance: BranchBalance | null }) {
  if (!balance) return null;

  const isLow = balance.saldo < balance.alert_threshold;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saldo Kas Cabang — {balance.branch_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <RevenueTile
          icon={Wallet}
          label="Saldo Saat Ini"
          value={formatCurrency(balance.saldo)}
          tone={isLow ? "destructive" : "success"}
        />
        {isLow && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {SITUATION_LABEL[balance.situation_type]}
              {balance.situation_type === "cash_low" && ` (ambang batas ${formatCurrency(balance.alert_threshold)} — biaya gaji + operasional bulanan cabang ini)`}
              . Rekomendasi tindakan AI akan dikirim via WhatsApp.
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Sinkron terakhir: {new Date(balance.synced_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </CardContent>
    </Card>
  );
}

/** Company-wide overview for Super Admin / Direktur -- every branch, one glance. */
export function AllBranchBalancesCard({ balances }: { balances: BranchBalance[] }) {
  if (!balances.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saldo Kas per Cabang</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {balances.map((b) => {
            const isLow = b.saldo < b.alert_threshold;
            return (
              <div key={b.branch_id} className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.branch_name}</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${isLow ? "text-destructive" : ""}`}>{formatCurrency(b.saldo)}</p>
                {isLow && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" /> {SITUATION_LABEL[b.situation_type]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
