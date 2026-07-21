"use client";

import { useEffect, useMemo, useState } from "react";

import { ReadyToRenderList } from "@/features/kontenai/render-engine/components/ready-to-render-list";
import { RenderQueueTable } from "@/features/kontenai/render-engine/components/render-queue-table";
import { submitRenderJobAction } from "@/features/kontenai/render-engine/actions/render-engine.actions";
import type { StoryboardSummary } from "@/features/kontenai/render-engine/types";
import type { RenderJob } from "@/features/kontenai/types";

interface RenderEngineBoardProps {
  initialStoryboards: StoryboardSummary[];
  initialJobs: RenderJob[];
}

/**
 * There is no ffmpeg (or any real encoder) in this environment and real
 * rendering is out of scope for this build, so the queued -> rendering
 * -> completed/failed lifecycle is simulated entirely client-side: a
 * 1s ticker advances `progress` on in-flight jobs in local state. This
 * intentionally does not survive a page refresh -- it's a placeholder
 * for the real render worker a later phase would wire up.
 */
export function RenderEngineBoard({ initialStoryboards, initialJobs }: RenderEngineBoardProps) {
  const [jobs, setJobs] = useState<RenderJob[]>(initialJobs);

  useEffect(() => {
    const interval = setInterval(() => {
      setJobs((prev) =>
        prev.map((job) => {
          if (job.status === "queued") {
            // Simulate the worker picking the job up off the queue.
            if (Math.random() < 0.6) {
              return { ...job, status: "rendering", startedAt: new Date().toISOString() };
            }
            return job;
          }

          if (job.status === "rendering") {
            const nextProgress = Math.min(100, job.progress + 8 + Math.floor(Math.random() * 13));
            if (nextProgress >= 100) {
              return {
                ...job,
                status: "completed",
                progress: 100,
                completedAt: new Date().toISOString(),
                outputUrl: `https://cdn.mock.kontenai.local/renders/${job.id}.mp4`,
              };
            }
            return { ...job, progress: nextProgress };
          }

          return job;
        }),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const queuedStoryboardIds = useMemo(
    () =>
      new Set(
        jobs.filter((job) => job.status === "queued" || job.status === "rendering").map((job) => job.storyboardId),
      ),
    [jobs],
  );

  async function handleRender(storyboardId: string) {
    const newJob = await submitRenderJobAction(storyboardId);
    setJobs((prev) => [newJob, ...prev]);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Ready to Render</h2>
        <ReadyToRenderList
          storyboards={initialStoryboards}
          queuedStoryboardIds={queuedStoryboardIds}
          onRender={handleRender}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Render Queue</h2>
        <RenderQueueTable jobs={jobs} />
      </section>
    </div>
  );
}
