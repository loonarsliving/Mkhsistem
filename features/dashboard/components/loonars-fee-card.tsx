"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

import { listMyLoonarsClosingsAction, requestLoonarsFeeAction } from "@/features/crm/actions/loonars-closing.actions";

function FeeRow({ closing, onRequested }: { closing: NonNullable<Awaited<ReturnType<typeof listMyLoonarsClosingsAction>>>[number]; onRequested: () => void }) {
  const [claiming, setClaiming] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function handleClaim() {
    const feeAmount = Number(amount);
    if (!feeAmount || feeAmount <= 0) {
      toast.error("Nominal fee tidak valid");
      return;
    }
    setBusy(true);
    const result = await requestLoonarsFeeAction(closing.id, feeAmount);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengajukan fee");
      return;
    }
    toast.success("Fee diajukan — menunggu approval owner");
    setClaiming(false);
    onRequested();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">
          {closing.proyek} — Unit {closing.blok}
        </p>
        <p className="text-xs text-muted-foreground">{closing.buyer ?? "-"} · {formatCurrency(closing.price ?? 0)}</p>
      </div>

      {closing.status === "pending_verification" && <Badge variant="outline">Menunggu Verifikasi</Badge>}

      {closing.status === "verified" && !closing.fee_requested && !claiming && (
        <Button size="sm" onClick={() => setClaiming(true)}>
          Ajukan Fee
        </Button>
      )}

      {closing.status === "verified" && !closing.fee_requested && claiming && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Nominal fee (Rp)"
            className="h-8 w-36"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button size="sm" disabled={busy} onClick={handleClaim}>
            Kirim
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setClaiming(false)}>
            Batal
          </Button>
        </div>
      )}

      {closing.status === "verified" && closing.fee_requested && <Badge variant="outline">Fee Diajukan — Menunggu Approval</Badge>}
    </div>
  );
}

export function LoonarsFeeCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-loonars-closings"], queryFn: listMyLoonarsClosingsAction });

  const items = data ?? [];
  if (!isLoading && items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Home className="h-4 w-4" /> Closing Loonars Villa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((c) => (
          <FeeRow key={c.id} closing={c} onRequested={() => queryClient.invalidateQueries({ queryKey: ["my-loonars-closings"] })} />
        ))}
      </CardContent>
    </Card>
  );
}
