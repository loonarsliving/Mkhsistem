import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OptimizationRecommendation } from "@/features/kontenai/types";

interface SummaryStatsProps {
  recommendations: OptimizationRecommendation[];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Summary tiles: counts per status plus avg confidence of proposed recommendations. */
export function SummaryStats({ recommendations }: SummaryStatsProps) {
  const proposed = recommendations.filter((rec) => rec.status === "proposed");
  const applied = recommendations.filter((rec) => rec.status === "applied");
  const dismissed = recommendations.filter((rec) => rec.status === "dismissed");
  const avgConfidence = average(proposed.map((rec) => rec.confidence));

  const tiles = [
    { label: "Diusulkan", value: proposed.length, hint: "Menunggu keputusan" },
    { label: "Diterapkan", value: applied.length, hint: "Sudah masuk pipeline" },
    { label: "Ditolak", value: dismissed.length, hint: "Tidak diterapkan" },
    { label: "Rata-rata Keyakinan", value: `${Math.round(avgConfidence * 100)}%`, hint: "Dari rekomendasi yang diusulkan" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{tile.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
