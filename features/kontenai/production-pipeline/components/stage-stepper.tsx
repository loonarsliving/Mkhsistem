import type { PipelineStage } from "@/features/kontenai/types";
import { cn } from "@/lib/utils";

import { STAGE_LABELS, STAGE_SEQUENCE } from "../types";

/** Small horizontal stepper matching the 8-stage PipelineStage sequence. */
export function StageStepper({ currentStage, className }: { currentStage: PipelineStage; className?: string }) {
  const currentIndex = STAGE_SEQUENCE.indexOf(currentStage);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {STAGE_SEQUENCE.map((stage, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "pending";
        return (
          <div key={stage} className="group relative flex items-center">
            <span
              title={STAGE_LABELS[stage]}
              className={cn(
                "h-2 w-5 rounded-full transition-colors sm:w-6",
                state === "done" && "bg-primary/40",
                state === "current" && "bg-primary",
                state === "pending" && "bg-muted",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
