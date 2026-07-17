"use client";

import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { getRetargetingCandidatesAction } from "../actions/loonars-beauty.actions";

const CATEGORY_LABEL: Record<string, string> = {
  problem_solution: "Problem-Solution",
  ugc: "Testimoni/UGC",
  edukasi: "Edukasi",
  promosi: "Promosi",
};

/** Strategy point 4: retargeting ringan untuk penonton yang menonton >50% durasi tapi belum klik ke toko. */
export function RetargetingAlerts() {
  const { data, isLoading } = useQuery({ queryKey: ["loonars-beauty-retargeting"], queryFn: () => getRetargetingCandidatesAction() });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <Target className="h-4 w-4 text-warning" />
        <CardTitle className="text-sm font-medium">Kandidat Retargeting</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Konten ini ditonton &gt;50% durasi tapi belum ada klik ke toko -- kandidat kuat untuk retargeting ringan (Spark Ads audience: viewers).
        </p>
        {data.map((row) => (
          <div key={row.id} className="flex items-center justify-between rounded-md border border-border bg-background p-2 text-sm">
            <div>
              <p className="font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">
                {CATEGORY_LABEL[row.category] ?? row.category} &middot; {row.platform} &middot; {row.totalViews.toLocaleString("id-ID")} views
              </p>
            </div>
            <Badge variant="warning">0 klik</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
