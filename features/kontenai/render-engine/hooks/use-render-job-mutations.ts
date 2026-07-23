"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createRenderJobAction } from "@/features/kontenai/render-engine/actions/render-storyboard.actions";

export const RENDER_JOBS_QUERY_KEY = ["kontenai-render-jobs"];
export const renderJobQueryKey = (jobId: string) => ["kontenai-render-job", jobId];

/**
 * Queues a render job -- the job id is returned right away so the caller
 * can start polling getRenderJobAction for real progress. The actual ffmpeg
 * render happens outside Vercel entirely: scripts/render-worker.ts (a
 * standalone process on its own host) picks up 'queued' jobs and does the
 * real encode there.
 */
export function useRunRenderJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyboardId: string) => {
      const created = await createRenderJobAction(storyboardId);
      if (!created.success) throw new Error(created.error ?? "Gagal membuat render job");
      return created.data!;
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
