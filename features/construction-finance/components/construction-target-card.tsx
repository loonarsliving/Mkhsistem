import { Target } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ConstructionTarget } from "@/repositories/construction-finance.repository";

const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

interface ConstructionTargetCardProps {
  target: ConstructionTarget;
}

export function ConstructionTargetCard({ target }: ConstructionTargetCardProps) {
  const periodEnd = new Date(target.periodYear, target.periodMonth, 0);
  const today = new Date();
  const daysLeft = Math.max(Math.ceil((periodEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          Target {MONTH_LABELS[target.periodMonth - 1]} {target.periodYear} — {target.projectName}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Target Unit</p>
          <p className="text-2xl font-bold tabular-nums">{target.targetUnits} SP3K</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Nilai per Unit</p>
          <p className="font-semibold tabular-nums">{formatCurrency(target.valuePerUnit)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Nilai Target</p>
          <p className="font-semibold tabular-nums">{formatCurrency(target.totalValue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sisa Waktu</p>
          <p className="font-semibold tabular-nums">{daysLeft} hari</p>
        </div>
      </CardContent>
    </Card>
  );
}
