import { Fragment } from "react";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STAGES = [
  "Research",
  "Content Audit",
  "Content Planner",
  "KontenAI",
  "Content Studio",
  "Publishing",
  "Analytics",
  "Learning",
];

export function PipelineFlow() {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-y-3 p-4">
        {STAGES.map((stage, index) => (
          <Fragment key={stage}>
            {stage === "KontenAI" ? (
              <Badge className="text-xs font-semibold">{stage}</Badge>
            ) : (
              <span className={cn("rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground")}>{stage}</span>
            )}
            {index < STAGES.length - 1 && <ChevronRight className="mx-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
