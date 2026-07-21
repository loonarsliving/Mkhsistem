"use client";

import { CalendarDays, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ContentBrief, ContentFocus, TargetPlatform } from "@/features/kontenai/types";

const FOCUS_LABEL: Record<ContentFocus, string> = {
  general: "General",
  leasehold_sales: "Leasehold Sales",
  occupancy: "Occupancy",
  beauty: "Beauty",
};

const FOCUS_BADGE_VARIANT: Record<ContentFocus, "default" | "secondary" | "outline"> = {
  general: "outline",
  leasehold_sales: "default",
  occupancy: "secondary",
  beauty: "secondary",
};

const PLATFORM_LABEL: Record<TargetPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

const GROWTH_SIGNAL_META = {
  excellent: { label: "Pertumbuhan Kuat", variant: "success" as const, icon: TrendingUp },
  on_track: { label: "Stabil", variant: "secondary" as const, icon: Minus },
  below_benchmark: { label: "Di Bawah Target", variant: "destructive" as const, icon: TrendingDown },
};

function formatDueDate(dueDate: string | null) {
  if (!dueDate) return "Tanpa tenggat";
  return new Date(dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

interface BriefListProps {
  briefs: ContentBrief[];
  selectedBriefId: string | null;
  onSelect: (briefId: string) => void;
}

export function BriefList({ briefs, selectedBriefId, onSelect }: BriefListProps) {
  if (briefs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Belum ada brief dari Content Planner. Brief akan muncul di sini setelah Content Planner membuat task baru.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {briefs.map((brief) => {
        const isSelected = brief.id === selectedBriefId;
        const signal = brief.auditInsight ? GROWTH_SIGNAL_META[brief.auditInsight.growthSignal] : null;
        const SignalIcon = signal?.icon;

        return (
          <Card
            key={brief.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(brief.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(brief.id);
            }}
            className={cn(
              "cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40",
              isSelected && "border-primary bg-accent/40 ring-1 ring-primary/30",
            )}
          >
            <CardHeader className="space-y-2 pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug">{brief.title}</h3>
                <Badge variant={FOCUS_BADGE_VARIANT[brief.contentFocus]}>{FOCUS_LABEL[brief.contentFocus]}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{PLATFORM_LABEL[brief.targetPlatform]}</Badge>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {formatDueDate(brief.dueDate)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {brief.description && <p className="line-clamp-2 text-sm text-muted-foreground">{brief.description}</p>}
              {signal && SignalIcon ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant={signal.variant}>
                    <SignalIcon className="mr-1 h-3 w-3" />
                    {signal.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Skor audit {brief.auditInsight!.scores.overall.toFixed(1)}/10
                  </span>
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">Belum ada riwayat Content Audit untuk brief ini.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
