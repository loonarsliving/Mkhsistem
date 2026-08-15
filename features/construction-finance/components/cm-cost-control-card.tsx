import { AlertTriangle, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ProjectCostControl } from "@/repositories/cm-cost-control.repository";

const STATUS_LABEL: Record<ProjectCostControl["status"], { label: string; variant: "outline" | "default" | "destructive" | "secondary" }> = {
  unknown: { label: "Belum Ada Anggaran", variant: "outline" },
  cost_ahead: { label: "Biaya Lebih Cepat dari Progress", variant: "destructive" },
  good: { label: "Progress Lebih Cepat dari Biaya", variant: "default" },
  balanced: { label: "Seimbang", variant: "secondary" },
};

export function CmCostControlCard({ cost }: { cost: ProjectCostControl }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Cost Control
        </CardTitle>
        <CardDescription>Bandingkan realisasi biaya terhadap progress pembangunan yang sudah disetujui.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          {cost.status === "cost_ahead" && <AlertTriangle className="h-4 w-4 text-destructive" />}
          <Badge variant={STATUS_LABEL[cost.status].variant}>{STATUS_LABEL[cost.status].label}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Anggaran</p>
            <p className="font-semibold tabular-nums">{formatCurrency(cost.budget)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Realisasi Biaya</p>
            <p className="font-semibold tabular-nums">
              {formatCurrency(cost.actualTotal)} {cost.costPct !== null && <span className="text-muted-foreground">({cost.costPct}%)</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Progress Pembangunan</p>
            <p className="font-semibold tabular-nums">{cost.progressPct}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">BOQ Material (Committed)</p>
            <p className="font-semibold tabular-nums">{formatCurrency(cost.boqCommitted)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 border-t pt-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Material</p>
            <p className="tabular-nums">{formatCurrency(cost.actualMaterial)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tenaga Kerja (Borongan)</p>
            <p className="tabular-nums">{formatCurrency(cost.actualLabor)}</p>
            {cost.laborCommitted > 0 && (
              <p className="text-xs text-muted-foreground">dari {formatCurrency(cost.laborCommitted)} nilai kontrak aktif</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Lain-lain</p>
            <p className="tabular-nums">{formatCurrency(cost.actualOther)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
