import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ConstructionProject } from "@/repositories/construction-finance.repository";

interface ConstructionSaldoCardProps {
  project: ConstructionProject;
}

/**
 * Always-visible Dashboard card for Kendari's Kepala Cabang -- his menu is
 * intentionally reduced to just this + the input form (see
 * KENDARI_KEPALA_CABANG_ALLOWED_PERMISSIONS), so the saldo needs to be
 * front and center on Home, not only inside the Keuangan Proyek page.
 */
export function ConstructionSaldoCard({ project }: ConstructionSaldoCardProps) {
  const sisaDana = project.danaMasuk - project.totalGajiTukang;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Saldo Dana Proyek
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Sisa Dana Tunai</p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(sisaDana)}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Total Anggaran</p>
            <p className="font-semibold tabular-nums">{formatCurrency(project.totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Dana Sudah Ditransfer</p>
            <p className="font-semibold tabular-nums">{formatCurrency(project.danaMasuk)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Utang Toko Belum Lunas</p>
            <p className="font-semibold tabular-nums text-destructive">{formatCurrency(project.totalUtangBelumLunas)}</p>
          </div>
        </div>
        <Link href="/construction-finance" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Input gaji tukang / material <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
