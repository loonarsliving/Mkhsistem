"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { getContentRatioSummaryAction } from "../actions/loonars-beauty.actions";

const CATEGORY_LABEL: Record<string, string> = {
  problem_solution: "Problem-Solution",
  ugc: "Testimoni/UGC",
  edukasi: "Edukasi",
  promosi: "Promosi",
};

export function ContentRatioSummary() {
  const { data, isLoading } = useQuery({ queryKey: ["loonars-beauty-ratio-summary"], queryFn: () => getContentRatioSummaryAction() });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Rasio Konten (30 hari terakhir)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
        {!isLoading && (!data || data.every((row) => row.actualCount === 0)) && (
          <p className="text-sm text-muted-foreground">Belum ada konten yang dipublikasikan dalam 30 hari terakhir.</p>
        )}
        {data?.map((row) => {
          const offTarget = Math.abs(row.actualPct - row.target) >= 15 && row.actualCount > 0;
          return (
            <div key={row.category} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{CATEGORY_LABEL[row.category] ?? row.category}</span>
                <span className={offTarget ? "text-warning" : "text-muted-foreground"}>
                  {row.actualPct}% aktual &middot; target {row.target}% &middot; {row.actualCount} konten
                </span>
              </div>
              <Progress value={row.actualPct} tone={offTarget ? "warning" : "default"} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
