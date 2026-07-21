"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { listPipelineRunsAction } from "../actions/production-pipeline.actions";
import { STAGE_LABELS, type PipelineRunView } from "../types";
import { RunDetailDialog } from "./run-detail-dialog";
import { RunStatusBadge } from "./run-status-badge";
import { StageDistribution } from "./stage-distribution";
import { StageStepper } from "./stage-stepper";
import { StartRunDialog } from "./start-run-dialog";

export function PipelineBoard() {
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ["kontenai-pipeline-runs"],
    queryFn: listPipelineRunsAction,
  });

  const selectedRun = React.useMemo<PipelineRunView | null>(
    () => runs?.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Layers className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Belum ada pipeline run</p>
          <p className="text-sm text-muted-foreground">
            Run akan muncul di sini setelah Content Planner mengirim brief ke KontenAI.
          </p>
          <div className="mt-2">
            <StartRunDialog />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <StartRunDialog />
      </div>

      <StageDistribution runs={runs} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brief</TableHead>
            <TableHead>Tahap</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Revisi</TableHead>
            <TableHead>Skor Studio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              className="cursor-pointer"
              onClick={() => setSelectedRunId(run.id)}
              tabIndex={0}
              role="button"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelectedRunId(run.id);
              }}
            >
              <TableCell>
                <div className="font-medium">{run.brief.title}</div>
                <div className="text-xs text-muted-foreground">
                  {run.brief.targetPlatform} - {run.brief.contentFocus.replace("_", " ")}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1.5">
                  <Badge variant="outline" className="w-fit">
                    {STAGE_LABELS[run.currentStage]}
                  </Badge>
                  <StageStepper currentStage={run.currentStage} />
                </div>
              </TableCell>
              <TableCell>
                <RunStatusBadge status={run.status} />
              </TableCell>
              <TableCell className="text-center">{run.revisionCount}</TableCell>
              <TableCell>{run.contentStudioScore !== null ? run.contentStudioScore.toFixed(1) : "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <RunDetailDialog run={selectedRun} onOpenChange={(open) => !open && setSelectedRunId(null)} />
    </div>
  );
}
