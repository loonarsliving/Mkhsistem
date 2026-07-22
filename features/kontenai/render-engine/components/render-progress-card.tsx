"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getRenderJobAction } from "@/features/kontenai/render-engine/actions/render-storyboard.actions";
import { renderJobQueryKey } from "@/features/kontenai/render-engine/hooks/use-render-job-mutations";

interface RenderProgressCardProps {
  jobId: string;
  onRetry: () => void;
  retryDisabled: boolean;
}

const ACTIVE_STATUSES = new Set(["queued", "rendering"]);

/** Polls one render job's real progress/stage while it's in flight, then shows the video preview + download (completed) or the error + retry (failed) -- spec items 7, 9, 10, 12. */
export function RenderProgressCard({ jobId, onRetry, retryDisabled }: RenderProgressCardProps) {
  const { data: job, isLoading } = useQuery({
    queryKey: renderJobQueryKey(jobId),
    queryFn: () => getRenderJobAction(jobId),
    refetchInterval: (query) => (query.state.data && ACTIVE_STATUSES.has(query.state.data.status) ? 1500 : false),
  });

  if (isLoading || !job) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">Memuat status render...</CardContent>
      </Card>
    );
  }

  if (job.status === "failed") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Render Gagal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{job.error_message ?? "Terjadi kesalahan saat merender storyboard."}</p>
          <Button type="button" variant="outline" size="sm" disabled={retryDisabled} onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            Render Ulang
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (job.status === "completed") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Render Selesai
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {job.output_public_url && <video src={job.output_public_url} controls className="w-full max-w-md rounded-md border" />}
          <div className="flex flex-wrap items-center gap-2">
            {job.output_public_url && (
              <Button asChild size="sm">
                <a href={job.output_public_url} download={`storyboard-draft-${job.storyboard_id}.mp4`}>
                  <Download className="h-4 w-4" />
                  Unduh Video Draft
                </a>
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" disabled={retryDisabled} onClick={onRetry}>
              <RefreshCw className="h-4 w-4" />
              Render Ulang
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Merender Video Draft...</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={job.progress} />
        <p className="text-xs text-muted-foreground">
          {Math.round(job.progress)}% -- {job.stage}
        </p>
      </CardContent>
    </Card>
  );
}
