"use client";

import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAiHealthStatusAction } from "@/features/monitoring/actions/monitoring-query.actions";

export function AiHealthStatusCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-health-status"],
    queryFn: getAiHealthStatusAction,
    refetchInterval: 60_000,
  });

  const status = isLoading ? "Memeriksa..." : !data?.configured ? "Belum dikonfigurasi" : data.detail;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <BrainCircuit className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Koneksi Gemini AI</p>
            <p className="text-xs text-muted-foreground">{status}</p>
          </div>
        </div>
        {!isLoading && data && (
          <Badge variant={data.ok ? "success" : "destructive"}>
            {data.ok ? "Terhubung" : data.configured ? "Bermasalah" : "Belum Aktif"}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
