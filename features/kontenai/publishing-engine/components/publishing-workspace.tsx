"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { listCompletedRenderJobsAction } from "@/features/kontenai/publishing-engine/actions/publishing.actions";
import { COMPLETED_RENDER_JOBS_QUERY_KEY } from "@/features/kontenai/publishing-engine/hooks/use-publishing-mutations";
import { PublishForm } from "@/features/kontenai/publishing-engine/components/publish-form";
import { RenderJobPicker } from "@/features/kontenai/publishing-engine/components/render-job-picker";

function FormPlaceholder() {
  return (
    <Card>
      <CardContent className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 py-10 text-center">
        <Send className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Pilih video hasil Render Engine di sebelah kiri untuk menjadwalkan publish-nya.</p>
      </CardContent>
    </Card>
  );
}

/** Publishing Engine's workspace: pick a rendered video -> platform + AI caption/hashtag -> schedule date/time -> save. Saved schedules are reviewed on the separate Content Calendar page. */
export function PublishingWorkspace() {
  const [selectedRenderJobId, setSelectedRenderJobId] = React.useState<string | null>(null);

  const { data: jobs } = useQuery({ queryKey: COMPLETED_RENDER_JOBS_QUERY_KEY, queryFn: listCompletedRenderJobsAction });
  const selectedJob = (jobs ?? []).find((job) => job.id === selectedRenderJobId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <RenderJobPicker selectedRenderJobId={selectedRenderJobId} onSelect={setSelectedRenderJobId} />
      {selectedJob ? <PublishForm key={selectedJob.id} renderJob={selectedJob} /> : <FormPlaceholder />}
    </div>
  );
}
