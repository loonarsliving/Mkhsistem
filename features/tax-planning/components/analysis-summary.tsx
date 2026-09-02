import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaxComputationResult } from "@/lib/tax-planning/calculator";

function idr(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

const REGIME_LABEL: Record<TaxComputationResult["recommendedNonFinalRegime"], string> = {
  "31e": "Normal + Pasal 31E",
  umkm_final: "PP 55/2022 (final 0,5%)",
  none: "Tidak ada pajak terutang",
};

/**
 * The numbers that matter most, in the order a reader should see them: what
 * is final-taxed (excluded from the normal base), what regime applies to
 * everything else, the total estimate, and -- the headline -- how much that
 * differs from a naive flat-rate calculation that doesn't make the
 * final/non-final split at all.
 */
export function AnalysisSummary({ result }: { result: TaxComputationResult }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>PPh Final Ps.4(2) — penjualan rumah</CardDescription>
            <CardTitle className="text-xl">{idr(result.finalTaxLiabilityIdr)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">2,5% dari {idr(result.finalRevenueGrossIdr)} nilai bruto pengalihan (PP 34/2016)</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>PPh Badan non-final</CardDescription>
            <CardTitle className="text-xl">{idr(result.nonFinalTaxLiabilityIdr)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Skema: {REGIME_LABEL[result.recommendedNonFinalRegime]}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total estimasi pajak</CardDescription>
            <CardTitle className="text-xl">{idr(result.totalEstimatedTaxIdr)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Final + non-final, periode {result.periodStart} s.d. {result.periodEnd}</CardContent>
        </Card>
      </div>

      {result.estimatedSavingsVsNaiveIdr > 0 && (
        <Card className="border-success/40 bg-success/5">
          <CardHeader className="pb-2">
            <CardDescription>Potensi penghematan vs. perhitungan flat 22% tanpa pemisahan final/non-final</CardDescription>
            <CardTitle className="text-2xl text-success">{idr(result.estimatedSavingsVsNaiveIdr)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Perhitungan flat (tanpa memisahkan pendapatan final): {idr(result.naiveFlatTaxIdr)}. Ini adalah estimasi -- validasi dengan konsultan pajak sebelum dipakai untuk SPT.
          </CardContent>
        </Card>
      )}

      {result.newFiscalLossIdr > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rugi fiskal baru periode ini (non-final, dapat dikompensasi 5 tahun)</CardDescription>
            <CardTitle className="text-lg">{idr(result.newFiscalLossIdr)}</CardTitle>
          </CardHeader>
        </Card>
      )}

      {result.unclassifiedAccountCodes.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {result.unclassifiedAccountCodes.length} kode akun ({result.unclassifiedAccountCodes.join(", ")}) tidak dikenali dan dikecualikan dari perhitungan
            di atas.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Omzet estimasi: {idr(result.estimatedTurnoverIdr)}</Badge>
        <Badge variant="outline">{result.eligibleFor31E ? "Memenuhi ambang batas Pasal 31E" : "Di atas ambang batas Pasal 31E"}</Badge>
      </div>
    </div>
  );
}
