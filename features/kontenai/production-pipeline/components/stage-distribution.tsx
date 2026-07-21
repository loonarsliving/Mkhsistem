import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { STAGE_LABELS, STAGE_SEQUENCE, type PipelineRunView } from "../types";

export function StageDistribution({ runs, className }: { runs: PipelineRunView[]; className?: string }) {
  const counts = new Map(STAGE_SEQUENCE.map((stage) => [stage, 0]));
  for (const run of runs) {
    counts.set(run.currentStage, (counts.get(run.currentStage) ?? 0) + 1);
  }

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8", className)}>
      {STAGE_SEQUENCE.map((stage) => (
        <Card key={stage}>
          <CardContent className="p-3">
            <p className="truncate text-xs font-medium text-muted-foreground" title={STAGE_LABELS[stage]}>
              {STAGE_LABELS[stage]}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{counts.get(stage) ?? 0}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
