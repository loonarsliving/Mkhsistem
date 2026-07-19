"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Loader2, Sparkles, TrendingDown, TrendingUp, Target } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

import { getLatestCompetitorComparisonAction, triggerCompetitorComparisonAction } from "../actions/social.actions";

interface ComparisonPayload {
  ourStrengths: string[];
  competitorStrengths: string[];
  gaps: string[];
  recommendations: string[];
}

function ListBlock({ icon: Icon, label, items }: { icon: React.ComponentType<{ className?: string }>; label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="h-4 w-4" /> {label}
      </p>
      <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Phase 2 of the Content Planner roadmap: our recent leasehold-account
 * content vs registered leasehold competitors (0124). AI-generated,
 * refreshed automatically every Monday -- the "Jalankan Analisa Sekarang"
 * button lets Markom get a fresh read on demand instead of waiting a week.
 */
export function CompetitorComparisonCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [triggering, setTriggering] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["leasehold-competitor-comparison"],
    queryFn: getLatestCompetitorComparisonAction,
  });

  async function handleTrigger() {
    setTriggering(true);
    const result = await triggerCompetitorComparisonAction();
    setTriggering(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menjalankan analisa");
      return;
    }
    toast.success("Analisa perbandingan sedang diproses AI, hasil akan muncul di sini dalam beberapa saat");
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["leasehold-competitor-comparison"] }), 8000);
  }

  const comparison = data?.comparison as unknown as ComparisonPayload | undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Analisa Perbandingan vs Kompetitor Leasehold</CardTitle>
        {canManage && (
          <Button size="sm" variant="outline" disabled={triggering} onClick={handleTrigger}>
            {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Jalankan Analisa Sekarang
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoading && !data && (
          <EmptyState
            icon={Sparkles}
            title="Belum ada analisa"
            description="Analisa otomatis berjalan tiap Senin, atau daftarkan kompetitor lalu jalankan analisa sekarang."
          />
        )}
        {data && comparison && (
          <>
            <p className="text-xs text-muted-foreground">
              Diperbarui {format(new Date(data.generated_at), "d MMM yyyy, HH:mm", { locale: idLocale })} WITA
            </p>
            <p className="text-sm text-muted-foreground">{data.narrative}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <ListBlock icon={TrendingUp} label="Kekuatan Kami" items={comparison.ourStrengths} />
              <ListBlock icon={TrendingDown} label="Kekuatan Kompetitor" items={comparison.competitorStrengths} />
            </div>
            <ListBlock icon={Target} label="Kesenjangan (dipakai untuk checklist berikutnya)" items={comparison.gaps} />
            <ListBlock icon={Sparkles} label="Rekomendasi" items={comparison.recommendations} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
