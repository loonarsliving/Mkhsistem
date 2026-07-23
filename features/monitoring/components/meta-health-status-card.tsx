"use client";

import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getMetaHealthStatusAction } from "@/features/monitoring/actions/monitoring-query.actions";

export function MetaHealthStatusCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["meta-health-status"],
    queryFn: getMetaHealthStatusAction,
    refetchInterval: 60_000,
  });

  const status = isLoading ? "Memeriksa..." : !data?.configured ? "Belum dikonfigurasi" : data.detail;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Koneksi Meta Ads</p>
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
