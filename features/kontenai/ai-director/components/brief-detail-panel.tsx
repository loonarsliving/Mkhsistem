"use client";

import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { generateDirectiveAction } from "@/features/kontenai/ai-director/actions/ai-director.actions";
import { DirectiveResult } from "@/features/kontenai/ai-director/components/directive-result";
import type { ContentBrief, ContentFocus, TargetPlatform } from "@/features/kontenai/types";

const FOCUS_LABEL: Record<ContentFocus, string> = {
  general: "General",
  leasehold_sales: "Leasehold Sales",
  occupancy: "Occupancy",
  beauty: "Beauty",
};

const PLATFORM_LABEL: Record<TargetPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

const SCORE_LABELS: Record<string, string> = {
  hook: "Hook",
  value: "Value",
  cta: "CTA",
  nicheFit: "Kesesuaian Niche",
  engagementPotential: "Potensi Engagement",
  platformOptimization: "Optimasi Platform",
};

function formatDueDate(dueDate: string | null) {
  if (!dueDate) return "Tanpa tenggat";
  return new Date(dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function GeneratingSkeleton() {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-4 py-6">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          AI Director sedang menyusun arahan produksi...
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}

interface BriefDetailPanelProps {
  brief: ContentBrief;
}

export function BriefDetailPanel({ brief }: BriefDetailPanelProps) {
  const {
    mutate: generateDirective,
    data: directive,
    isPending,
    reset,
  } = useMutation({
    mutationFn: () => generateDirectiveAction(brief.id),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{brief.title}</CardTitle>
            <Badge>{FOCUS_LABEL[brief.contentFocus]}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{PLATFORM_LABEL[brief.targetPlatform]}</Badge>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {formatDueDate(brief.dueDate)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {brief.description && <p className="text-sm text-muted-foreground">{brief.description}</p>}

          {brief.auditInsight ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold">Insight Content Audit Terakhir</p>
              <p className="text-sm text-muted-foreground">{brief.auditInsight.narrative}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-xs sm:grid-cols-3">
                {Object.entries(SCORE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold tabular-nums">
                      {brief.auditInsight!.scores[key as keyof typeof brief.auditInsight.scores].toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
              {brief.auditInsight.recommendations.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5 pt-1 text-xs text-muted-foreground">
                  {brief.auditInsight.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border p-3 text-xs italic text-muted-foreground">
              Belum ada riwayat Content Audit untuk brief ini -- AI Director akan menyusun arahan berdasarkan brief saja.
            </p>
          )}

          <Button
            onClick={() => {
              reset();
              generateDirective();
            }}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isPending ? "Menyusun Arahan..." : "Generate Directive"}
          </Button>
        </CardContent>
      </Card>

      {isPending && <GeneratingSkeleton />}
      {!isPending && directive && <DirectiveResult directive={directive} />}
    </div>
  );
}
