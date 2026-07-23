"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { listAvailableContentBriefsAction, startPipelineRunAction } from "../actions/production-pipeline.actions";

/**
 * Lets the user kick off a brand-new pipeline run from one of the real
 * Content Planner briefs seeded in the shared mock-db, instead of only
 * ever viewing runs that already exist.
 */
export function StartRunDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [selectedBriefId, setSelectedBriefId] = React.useState<string | undefined>(undefined);
  const [isStarting, setIsStarting] = React.useState(false);

  const { data: briefs, isLoading } = useQuery({
    queryKey: ["kontenai-available-content-briefs"],
    queryFn: listAvailableContentBriefsAction,
    enabled: open,
  });

  async function handleStart() {
    if (!selectedBriefId) {
      toast.error("Pilih brief terlebih dahulu");
      return;
    }
    setIsStarting(true);
    const result = await startPipelineRunAction(selectedBriefId);
    setIsStarting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memulai run baru");
      return;
    }
    toast.success(`Run baru dimulai untuk "${result.data!.brief.title}"`);
    setOpen(false);
    setSelectedBriefId(undefined);
    await queryClient.invalidateQueries({ queryKey: ["kontenai-pipeline-runs"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Start New Run
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mulai Pipeline Run Baru</DialogTitle>
          <DialogDescription>
            Pilih brief dari Content Planner untuk mulai diproses oleh AI Director, Storyboard Engine, Asset Selector, dan Render
            Engine secara berurutan.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedBriefId} onValueChange={setSelectedBriefId} disabled={isLoading}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={isLoading ? "Memuat brief..." : "Pilih content brief"} />
          </SelectTrigger>
          <SelectContent>
            {briefs?.map((brief) => (
              <SelectItem key={brief.id} value={brief.id}>
                {brief.title} - {brief.contentFocus.replace("_", " ")} ({brief.targetPlatform})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button onClick={handleStart} disabled={isStarting || !selectedBriefId}>
            {isStarting && <Loader2 className="h-4 w-4 animate-spin" />}
            Mulai Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
