"use client";

import { AlertTriangle, Clapperboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RenderJob } from "@/features/kontenai/types";
import { RenderJobStatusBadge } from "@/features/kontenai/render-engine/components/render-job-status-badge";

function formatTimestamp(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function RenderSettingsLine({ job }: { job: RenderJob }) {
  return (
    <span className="whitespace-nowrap text-xs text-muted-foreground">
      {job.renderSettings.resolution} - {job.renderSettings.format.toUpperCase()} - {job.renderSettings.fps}fps
    </span>
  );
}

function JobProgressOrError({ job }: { job: RenderJob }) {
  if (job.status === "failed") {
    return (
      <div className="flex items-start gap-1.5 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{job.errorMessage ?? "Render failed."}</span>
      </div>
    );
  }
  if (job.status === "rendering" || job.status === "queued") {
    return (
      <div className="flex min-w-[8rem] items-center gap-2">
        <Progress value={job.progress} className="w-24" />
        <span className="text-xs tabular-nums text-muted-foreground">{job.progress}%</span>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">100%</span>;
}

function JobOutputAction({ job }: { job: RenderJob }) {
  if (job.status !== "completed") {
    return (
      <Button variant="outline" size="sm" disabled>
        <Clapperboard className="h-4 w-4" />
        Preview
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" disabled title={job.outputUrl ?? undefined}>
      <Clapperboard className="h-4 w-4" />
      Preview
    </Button>
  );
}

export function RenderQueueTable({ jobs }: { jobs: RenderJob[] }) {
  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <Clapperboard className="h-8 w-8 opacity-50" />
          <p>Belum ada render job. Render sebuah storyboard untuk memulai.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Table layout for md+ viewports */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Settings</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead className="text-right">Output</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <span>{job.id}</span>
                    <span className="text-xs font-normal text-muted-foreground">{job.storyboardId}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <RenderJobStatusBadge status={job.status} />
                </TableCell>
                <TableCell>
                  <JobProgressOrError job={job} />
                </TableCell>
                <TableCell>
                  <RenderSettingsLine job={job} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatTimestamp(job.startedAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatTimestamp(job.completedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <JobOutputAction job={job} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Card layout for small viewports */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {jobs.map((job) => (
          <Card key={job.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{job.id}</span>
                  <span className="text-xs text-muted-foreground">{job.storyboardId}</span>
                </div>
                <RenderJobStatusBadge status={job.status} />
              </div>
              <JobProgressOrError job={job} />
              <RenderSettingsLine job={job} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Started: {formatTimestamp(job.startedAt)}</span>
                <span>Done: {formatTimestamp(job.completedAt)}</span>
              </div>
              <div className="flex justify-end">
                <JobOutputAction job={job} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
