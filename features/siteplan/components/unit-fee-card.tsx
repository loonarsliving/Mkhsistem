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

import { listMySiteplanPurchasesAction, requestSiteplanFeeAction } from "../actions/siteplan.actions";

type MyPurchase = NonNullable<Awaited<ReturnType<typeof listMySiteplanPurchasesAction>>>[number];

function FeeRow({ purchase, onRequested }: { purchase: MyPurchase; onRequested: () => void }) {
  const [claiming, setClaiming] = React.useState(false);
  const [amount, setAmount] = React.useState<number | undefined>();
  const [busy, setBusy] = React.useState(false);

  async function handleClaim() {
    if (!amount || amount <= 0) {
      toast.error("Nominal fee tidak valid");
      return;
    }
    setBusy(true);
    const result = await requestSiteplanFeeAction(purchase.id, amount);
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

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">
          {projectName} — Unit {blok}
        </p>
        <p className="text-xs text-muted-foreground">
          {purchase.buyer_name} · {formatCurrency(purchase.price ?? 0)}
        </p>
      </div>

      {purchase.status === "pending_verification" && <Badge variant="outline">Menunggu Verifikasi</Badge>}
      {purchase.status === "rejected" && <Badge variant="destructive">Ditolak</Badge>}
      {/* Fee is only claimable once the transaction is a full payment (akad) -- a verified Booking Fee/DP is not fee-claimable yet, mirroring the loonars_unit_fee_request RPC's own check (0204). */}
      {purchase.status === "verified" && purchase.transaction_type !== "akad" && (
        <Badge variant="outline">Terverifikasi — Menunggu Pelunasan</Badge>
      )}

      {purchase.status === "verified" && purchase.transaction_type === "akad" && !claiming && (
        <Button size="sm" onClick={() => setClaiming(true)}>
          Ajukan Fee
        </Button>
      )}

      {purchase.status === "verified" && purchase.transaction_type === "akad" && claiming && (
        <div className="flex items-center gap-2">
          <CurrencyInput className="h-8 w-40" value={amount} onValueChange={setAmount} />
          <Button size="sm" disabled={busy} onClick={handleClaim}>
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
          <FeeRow key={p.id} purchase={p} onRequested={() => queryClient.invalidateQueries({ queryKey: ["my-siteplan-purchases"] })} />
        ))}
      </CardContent>
    </Card>
  );
}
