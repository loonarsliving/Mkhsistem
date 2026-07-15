"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { getAdAccountBalanceAction } from "../actions/ads.actions";

function formatIdr(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/** Read-only -- Meta's Marketing API has no endpoint to add funds. Topping up or changing a payment method can only be done by a human in Meta Business Suite -> Billing. Always renders a visible status (never silently disappears) so a misconfigured connection or a rejected Meta call is obvious instead of invisible. */
export function AdAccountBalanceCard() {
  const { data, isLoading } = useQuery({ queryKey: ["meta-ad-account-balance"], queryFn: getAdAccountBalanceAction, refetchInterval: 300_000 });

  if (isLoading) return null;
  if (!data) return null;

  if (data.status === "not_configured") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Meta belum terhubung -- cek status koneksi di halaman Monitoring.</p>
        </CardContent>
      </Card>
    );
  }

  if (data.status === "error") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-destructive">Gagal mengambil info akun iklan: {data.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {data.balanceIdr > 0 ? `Saldo tersisa: ${formatIdr(data.balanceIdr)}` : "Akun menggunakan tagihan otomatis (bukan saldo prabayar)"}
            </p>
            <p className="text-xs text-muted-foreground">
              Total dibelanjakan: {formatIdr(data.amountSpentIdr)}
              {data.fundingSourceDescription ? ` · ${data.fundingSourceDescription}` : ""}
            </p>
          </div>
        </div>
        <p className="max-w-xs text-xs text-muted-foreground">
          Untuk menambah saldo atau mengubah metode pembayaran, buka Meta Business Suite &rarr; Billing -- tidak bisa dilakukan dari halaman ini.
        </p>
      </CardContent>
    </Card>
  );
}
