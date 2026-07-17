"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { listWeeklyContentAuditsAction } from "../actions/social.actions";

interface AuditScores {
  hook: number;
  value: number;
  cta: number;
  nicheFit: number;
  engagementPotential: number;
  platformOptimization: number;
  overall: number;
}

interface AuditHighlight {
  permalink: string | null;
  reasoning: string;
}

interface AuditData {
  narrative: string;
  scores: AuditScores;
  growthSignal: "excellent" | "on_track" | "below_benchmark";
  bestPost: AuditHighlight | null;
  worstPost: AuditHighlight | null;
  recommendations: string[];
}

const SCORE_LABELS: Record<keyof AuditScores, string> = {
  hook: "Hook",
  value: "Value",
  cta: "CTA",
  nicheFit: "Kesesuaian Niche",
  engagementPotential: "Potensi Engagement",
  platformOptimization: "Optimasi Platform",
  overall: "Skor Keseluruhan",
};

const GROWTH_SIGNAL: Record<AuditData["growthSignal"], { label: string; variant: "success" | "secondary" | "destructive"; icon: typeof TrendingUp }> = {
  excellent: { label: "Pertumbuhan Kuat", variant: "success", icon: TrendingUp },
  on_track: { label: "Stabil", variant: "secondary", icon: Minus },
  below_benchmark: { label: "Di Bawah Target", variant: "destructive", icon: TrendingDown },
};

function isAuditData(value: unknown): value is AuditData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.narrative === "string" && typeof v.scores === "object" && v.scores !== null;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{score.toFixed(1)}/10</span>
      </div>
      <Progress value={score * 10} className="h-1.5" />
    </div>
  );
}

export function ContentAuditBoard() {
  const { data, isLoading } = useQuery({ queryKey: ["content-audit-weekly"], queryFn: listWeeklyContentAuditsAction });

  if (isLoading) return <p className="text-sm text-muted-foreground">Memuat riwayat audit...</p>;
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada audit mingguan -- audit pertama akan dibuat otomatis Senin pagi.</p>;
  }

  return (
    <div className="space-y-4">
      {data.map((row) => {
        const audit = isAuditData(row.audit) ? row.audit : null;
        const weekLabel = new Date(row.week_start).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

        if (!audit) {
          return (
            <Card key={row.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Minggu {weekLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{row.evaluation}</p>
                <p className="mt-2 text-xs text-muted-foreground">(Audit skor belum tersedia untuk minggu ini -- format lama.)</p>
              </CardContent>
            </Card>
          );
        }

        const signal = GROWTH_SIGNAL[audit.growthSignal];
        const SignalIcon = signal.icon;

        return (
          <Card key={row.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Minggu {weekLabel}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={signal.variant}>
                  <SignalIcon className="mr-1 h-3 w-3" />
                  {signal.label}
                </Badge>
                <Badge variant="outline">Skor {audit.scores.overall.toFixed(1)}/10</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{audit.narrative}</p>

              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(SCORE_LABELS) as (keyof AuditScores)[])
                  .filter((k) => k !== "overall")
                  .map((k) => (
                    <ScoreBar key={k} label={SCORE_LABELS[k]} score={audit.scores[k]} />
                  ))}
              </div>

              {(audit.bestPost || audit.worstPost) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {audit.bestPost && (
                    <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                      <p className="mb-1 text-xs font-semibold text-success">Post Terbaik Minggu Ini</p>
                      <p className="text-sm text-muted-foreground">{audit.bestPost.reasoning}</p>
                      {audit.bestPost.permalink && (
                        <a href={audit.bestPost.permalink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          Lihat post <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                  {audit.worstPost && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <p className="mb-1 text-xs font-semibold text-destructive">Post Terlemah Minggu Ini</p>
                      <p className="text-sm text-muted-foreground">{audit.worstPost.reasoning}</p>
                      {audit.worstPost.permalink && (
                        <a href={audit.worstPost.permalink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          Lihat post <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {audit.recommendations.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold">Rekomendasi Minggu Depan</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {audit.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
