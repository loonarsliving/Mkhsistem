"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getHealthStatusAction } from "@/features/monitoring/actions/monitoring-query.actions";

export function HealthStatusCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["health-status"],
    queryFn: getHealthStatusAction,
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Status Database</p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Memeriksa..." : data ? `Latensi ${data.latencyMs}ms` : "-"}
            </p>
          </div>
        </div>
        {!isLoading && data && <Badge variant={data.ok ? "success" : "destructive"}>{data.ok ? "Sehat" : "Bermasalah"}</Badge>}
      </CardContent>
    </Card>
  );
}
