import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function scoreVariant(score: number): "success" | "warning" | "destructive" {
  if (score >= 0.75) return "success";
  if (score >= 0.4) return "warning";
  return "destructive";
}

interface MatchScoreBadgeProps {
  score: number;
  className?: string;
}

export function MatchScoreBadge({ score, className }: MatchScoreBadgeProps) {
  const pct = Math.round(score * 100);
  return (
    <Badge variant={scoreVariant(score)} className={className}>
      {pct}% match
    </Badge>
  );
}

interface MatchScoreBarProps {
  score: number;
  className?: string;
}

export function MatchScoreBar({ score, className }: MatchScoreBarProps) {
  const pct = Math.round(score * 100);
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Match score</span>
        <span className="font-semibold tabular-nums text-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}
