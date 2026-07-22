"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createPublishScheduleAction,
  generatePublishingCopyAction,
  publishNowAction,
  type CreatePublishScheduleActionInput,
} from "@/features/kontenai/publishing-engine/actions/publishing.actions";
import type { PublishPlatform } from "@/lib/publishing/platform-types";

export const PUBLISH_SCHEDULES_QUERY_KEY = ["kontenai-publish-schedules"];
export const COMPLETED_RENDER_JOBS_QUERY_KEY = ["kontenai-completed-render-jobs"];

export function useGeneratePublishingCopy() {
  return useMutation({
    mutationFn: async ({ renderJobId, platform }: { renderJobId: string; platform: PublishPlatform }) => {
      const result = await generatePublishingCopyAction(renderJobId, platform);
      if (!result.success) throw new Error(result.error ?? "Gagal menghasilkan caption & hashtag");
      return result.data!;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghasilkan caption & hashtag");
    },
  });
}

export function useCreatePublishSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePublishScheduleActionInput) => {
      const result = await createPublishScheduleAction(input);
      if (!result.success) throw new Error(result.error ?? "Gagal menyimpan jadwal publish");
      return result.data!;
    },
    onSuccess: (schedule) => {
      toast.success(schedule.status === "scheduled" ? "Jadwal publish disimpan" : "Disimpan sebagai draft");
      queryClient.invalidateQueries({ queryKey: PUBLISH_SCHEDULES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan jadwal publish");
    },
  });
}

export function usePublishNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const result = await publishNowAction(scheduleId);
      if (!result.success) throw new Error(result.error ?? "Gagal memproses publish");
      return result.data!;
    },
    onSuccess: (schedule) => {
      if (schedule.status === "published") toast.success("Berhasil dipublikasikan");
      else toast.error(`Publish gagal: ${schedule.error_message ?? "unknown error"}`);
      queryClient.invalidateQueries({ queryKey: PUBLISH_SCHEDULES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal memproses publish");
    },
  });
}
