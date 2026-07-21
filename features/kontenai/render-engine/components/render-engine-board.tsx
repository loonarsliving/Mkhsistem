"use client";

import { useEffect, useMemo, useState } from "react";

import { ReadyToRenderList } from "@/features/kontenai/render-engine/components/ready-to-render-list";
import { RenderQueueTable } from "@/features/kontenai/render-engine/components/render-queue-table";
import {
  advanceRenderJobAction,
  submitRenderJobAction,
} from "@/features/kontenai/render-engine/actions/render-engine.actions";
import type { StoryboardSummary } from "@/features/kontenai/render-engine/types";
import type { RenderJob } from "@/features/kontenai/types";

interface RenderEngineBoardProps {
  initialStoryboards: StoryboardSummary[];
  initialJobs: RenderJob[];
}

/**
 * There is no ffmpeg (or any real encoder) in this environment and real
 * rendering is out of scope for this build, so the queued -> rendering
 * -> completed/failed lifecycle is still driven by a 1s client-side
 * ticker -- but each tick now calls `advanceRenderJobAction` (a server
 * action) for every in-flight job instead of mutating progress purely in
 * local state. That keeps the shared mock-db store as the source of
 * truth for each job's status, so Production Pipeline (Sprint 7) sees
 * the same terminal `completed`/`failed` state this board renders,
 * rather than a client-only illusion of progress.
 */
export function RenderEngineBoard({ initialStoryboards, initialJobs }: RenderEngineBoardProps) {
  const [jobs, setJobs] = useState<RenderJob[]>(initialJobs);

  useEffect(() => {
    let cancelled = false;

    const interval = setInterval(() => {
      setJobs((currentJobs) => {
        const inFlightIds = currentJobs
          .filter((job) => job.status === "queued" || job.status === "rendering")
          .map((job) => job.id);

        if (inFlightIds.length === 0) {
          return currentJobs;
        }

        void Promise.all(inFlightIds.map((id) => advanceRenderJobAction(id))).then((updatedJobs) => {
          if (cancelled) return;
          setJobs((prev) => {
            const byId = new Map(updatedJobs.map((job) => [job.id, job]));
            return prev.map((job) => byId.get(job.id) ?? job);
          });
        });

        return currentJobs;
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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
