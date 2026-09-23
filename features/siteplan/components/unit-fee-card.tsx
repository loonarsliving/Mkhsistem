"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatCurrency } from "@/lib/utils";

import { getMyCommissionRateAction, listMySiteplanPurchasesAction, requestSiteplanFeeAction } from "../actions/siteplan.actions";
import { getSiteplanReceivedAmount } from "../utils/purchase-amount";

type MyPurchase = NonNullable<Awaited<ReturnType<typeof listMySiteplanPurchasesAction>>>[number];

function FeeRow({ purchase, myCommissionRatePercent, onRequested }: { purchase: MyPurchase; myCommissionRatePercent: number | null; onRequested: () => void }) {
  const [claiming, setClaiming] = React.useState(false);
  const [amount, setAmount] = React.useState<number | undefined>();
  const [busy, setBusy] = React.useState(false);

  async function handleClaim(computedAmount?: number) {
    if (computedAmount === undefined && (!amount || amount <= 0)) {
      toast.error("Nominal fee tidak valid");
      return;
    }
    setBusy(true);
    const result = await requestSiteplanFeeAction(purchase.id, computedAmount ?? amount);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengajukan fee");
      return;
    }
    toast.success("Fee diajukan — menunggu approval");
    setClaiming(false);
    onRequested();
  }

  const projectName = purchase.loonars_units?.loonars_projects?.nama ?? "-";
  const blok = purchase.loonars_units?.blok ?? "-";
  // 0274: a project with fee_claimable_at_dp = true (Loonars 2) accepts dp or akad, mirroring
  // loonars_unit_fee_request's own gate; every other project still requires akad (0204).
  const feeClaimableAtDp = purchase.loonars_units?.loonars_projects?.fee_claimable_at_dp ?? false;
  const feeClaimable = feeClaimableAtDp ? purchase.transaction_type === "dp" || purchase.transaction_type === "akad" : purchase.transaction_type === "akad";
  // 0275: a fee_rate_based project (Loonars 2) computes the amount itself from the rep's own
  // commission rate -- no free-text input, just a preview + single-click submit.
  const feeRateBased = purchase.loonars_units?.loonars_projects?.fee_rate_based ?? false;
  // Mirrors loonars_unit_fee_request's own round(price * rate / 100) exactly, so the preview always
  // matches what actually gets inserted server-side.
  const computedFee = feeRateBased && myCommissionRatePercent ? Math.round(((purchase.price ?? 0) * myCommissionRatePercent) / 100) : null;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">
          {projectName} — Unit {blok}
        </p>
        <p className="text-xs text-muted-foreground">
          {purchase.buyer_name} · {formatCurrency(getSiteplanReceivedAmount(purchase))}
          {purchase.transaction_type !== "akad" && ` dari harga ${formatCurrency(purchase.price ?? 0)}`}
        </p>
      </div>

      {purchase.status === "pending_verification" && <Badge variant="outline">Menunggu Verifikasi</Badge>}
      {purchase.status === "rejected" && <Badge variant="destructive">Ditolak</Badge>}
      {purchase.status === "verified" && !feeClaimable && <Badge variant="outline">Terverifikasi — Menunggu Pelunasan</Badge>}

      {purchase.status === "verified" && feeClaimable && feeRateBased && myCommissionRatePercent === null && (
        <Badge variant="outline">Rate komisi belum diatur — hubungi admin</Badge>
      )}

      {purchase.status === "verified" && feeClaimable && feeRateBased && computedFee !== null && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Fee ({myCommissionRatePercent}%): <span className="font-medium text-foreground">{formatCurrency(computedFee)}</span>
          </span>
          <Button size="sm" disabled={busy} onClick={() => handleClaim(computedFee)}>
            Ajukan Fee
          </Button>
        </div>
      )}

      {purchase.status === "verified" && feeClaimable && !feeRateBased && !claiming && (
        <Button size="sm" onClick={() => setClaiming(true)}>
          Ajukan Fee
        </Button>
      )}

      {purchase.status === "verified" && feeClaimable && !feeRateBased && claiming && (
        <div className="flex items-center gap-2">
          <CurrencyInput className="h-8 w-40" value={amount} onValueChange={setAmount} />
          <Button size="sm" disabled={busy} onClick={() => handleClaim()}>
            Kirim
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setClaiming(false)}>
            Batal
          </Button>
        </div>
      )}
    </div>
  );
}

/** Dashboard card mirroring LoonarsFeeCard's shape/pattern (features/dashboard/components/loonars-fee-card.tsx) but for the native siteplan feature -- shows a sales rep's own purchase attempts and lets them claim a fee once verified. Purchases that already have a fee request are filtered out client-side by cross-referencing listMySiteplanFeeRequestsAction would add a round trip; simpler to just always show "Ajukan Fee" until the purchase's status itself changes, since a rejected fee request goes back to pending-eligible via the RPC's own live-request check. */
export function SiteplanFeeCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-siteplan-purchases"], queryFn: listMySiteplanPurchasesAction });
  // Fetched once for the whole card -- same rate applies to every fee_rate_based row this rep owns.
  const { data: myRate } = useQuery({ queryKey: ["my-commission-rate"], queryFn: getMyCommissionRateAction });

  const items = (data ?? []).filter((p) => p.status !== "rejected");
  if (!isLoading && items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4" /> Pembelian Unit Siteplan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((p) => (
          <FeeRow
            key={p.id}
            purchase={p}
            myCommissionRatePercent={myRate?.commission_rate_percent ?? null}
            onRequested={() => {
              queryClient.invalidateQueries({ queryKey: ["my-siteplan-purchases"] });
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}
