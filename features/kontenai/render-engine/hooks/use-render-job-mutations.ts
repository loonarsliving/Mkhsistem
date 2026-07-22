"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createRenderJobAction, processRenderJobAction } from "@/features/kontenai/render-engine/actions/render-storyboard.actions";

export const RENDER_JOBS_QUERY_KEY = ["kontenai-render-jobs"];
export const renderJobQueryKey = (jobId: string) => ["kontenai-render-job", jobId];

/**
 * Queues a render job, then kicks off the actual ffmpeg render
 * (processRenderJobAction) without awaiting it -- the job id is returned
 * right away so the caller can start polling getRenderJobAction for real
 * progress while the render runs server-side.
 */
export function useRunRenderJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyboardId: string) => {
      const created = await createRenderJobAction(storyboardId);
      if (!created.success) throw new Error(created.error ?? "Gagal membuat render job");
      const job = created.data!;

      void processRenderJobAction(job.id).finally(() => {
        queryClient.invalidateQueries({ queryKey: RENDER_JOBS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: renderJobQueryKey(job.id) });
      });

      return job;
    },
    onSuccess: () => {
      toast.success("Render dimulai");
      queryClient.invalidateQueries({ queryKey: RENDER_JOBS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal memulai render");
    },
  });
}
