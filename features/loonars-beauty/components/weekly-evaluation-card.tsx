"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { getLatestWeeklyEvaluationAction, triggerWeeklyEvaluationAction } from "../actions/loonars-beauty.actions";

export function WeeklyEvaluationCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [triggering, setTriggering] = React.useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["loonars-beauty-weekly-evaluation"], queryFn: getLatestWeeklyEvaluationAction });

  async function handleTrigger() {
    setTriggering(true);
    const result = await triggerWeeklyEvaluationAction();
    setTriggering(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memicu evaluasi AI");
      return;
    }
    toast.success("Evaluasi AI diminta -- hasil biasanya muncul dalam beberapa menit, refresh halaman ini untuk melihatnya.");
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["loonars-beauty-weekly-evaluation"] }), 15000);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">
            Evaluasi Mingguan AI{data?.week_start ? ` · ${new Date(data.week_start).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}` : ""}
          </CardTitle>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" disabled={triggering} onClick={handleTrigger}>
            {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Jalankan Sekarang
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Memuat...</p>}
        {!isLoading && !data && (
          <p className="text-sm text-muted-foreground">
            Belum ada evaluasi. Evaluasi otomatis berjalan tiap Senin pagi, atau klik &quot;Jalankan Sekarang&quot; untuk memicu manual (butuh data performa &amp; order minggu ini agar hasilnya akurat).
          </p>
        )}
        {data && <p className="whitespace-pre-line text-sm text-muted-foreground">{data.evaluation}</p>}
      </CardContent>
    </Card>
  );
}
