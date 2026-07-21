"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, History, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StudioVerdict } from "@/features/kontenai/types";

import { advanceRunAction, submitStudioVerdictAction } from "../actions/production-pipeline.actions";
import { STAGE_LABELS, type PipelineRunView } from "../types";
import { RunStatusBadge } from "./run-status-badge";
import { StageStepper } from "./stage-stepper";

const AUTO_PUBLISH_THRESHOLD = 8.5;

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RunDetailDialogProps {
  run: PipelineRunView | null;
  onOpenChange: (open: boolean) => void;
}

export function RunDetailDialog({ run, onOpenChange }: RunDetailDialogProps) {
  const queryClient = useQueryClient();
  const [scoreInput, setScoreInput] = React.useState("8.0");
  const [isAdvancing, setIsAdvancing] = React.useState(false);
  const [isSubmittingVerdict, setIsSubmittingVerdict] = React.useState(false);

  React.useEffect(() => {
    setScoreInput("8.0");
  }, [run?.id]);

  if (!run) return null;

  const canAdvance =
    run.status !== "approved" && run.status !== "failed" && run.currentStage !== "studio_review" && run.currentStage !== "published";
  const canReview = run.currentStage === "studio_review";

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["kontenai-pipeline-runs"] });
  }

  async function handleAdvance() {
    if (!run) return;
    setIsAdvancing(true);
    const result = await advanceRunAction(run.id);
    setIsAdvancing(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memajukan tahap");
      return;
    }
    toast.success(`Run maju ke tahap ${STAGE_LABELS[result.data!.currentStage]}`);
    await refresh();
  }

  async function handleSubmitVerdict() {
    if (!run) return;
    const score = Number.parseFloat(scoreInput);
    if (Number.isNaN(score) || score < 0 || score > 10) {
      toast.error("Masukkan skor antara 0 dan 10");
      return;
    }
    const verdict: StudioVerdict = score >= AUTO_PUBLISH_THRESHOLD ? "approved" : "needs_revision";
    setIsSubmittingVerdict(true);
    const result = await submitStudioVerdictAction(run.id, score, verdict);
    setIsSubmittingVerdict(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim skor Content Studio");
      return;
    }
    if (verdict === "approved") {
      toast.success(`Disetujui Content Studio (skor ${score}) -- run dipublikasikan`);
    } else {
      toast.warning(`Content Studio minta revisi (skor ${score}) -- run #${result.data!.revisionCount} kembali ke ${STAGE_LABELS[result.data!.currentStage]}`);
    }
    await refresh();
  }

  return (
    <Dialog open={!!run} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{run.brief.title}</DialogTitle>
          <DialogDescription>
            Run <span className="font-mono">{run.id}</span> -- Brief <span className="font-mono">{run.contentBriefId}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <RunStatusBadge status={run.status} />
          <Badge variant="outline">{STAGE_LABELS[run.currentStage]}</Badge>
          {run.revisionCount > 0 && <Badge variant="secondary">{run.revisionCount}x revisi</Badge>}
          {run.contentStudioScore !== null && (
            <Badge variant={run.contentStudioScore >= AUTO_PUBLISH_THRESHOLD ? "success" : "warning"}>
              Skor Studio: {run.contentStudioScore}
            </Badge>
          )}
        </div>

        <StageStepper currentStage={run.currentStage} />

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Riwayat Tahap
          </h3>
          <ol className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-3">
            {run.history
              .slice()
              .reverse()
              .map((entry, index) => (
                <li key={`${entry.stage}-${entry.at}-${index}`} className="flex items-start gap-2 text-sm">
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{STAGE_LABELS[entry.stage]}</p>
                    <p className="text-xs text-muted-foreground">{formatTimestamp(entry.at)}</p>
                    {entry.note && <p className="mt-0.5 text-xs text-muted-foreground">{entry.note}</p>}
                  </div>
                </li>
              ))}
          </ol>
        </div>

        {canReview && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label htmlFor="studio-score">Simulasi Content Studio Review</Label>
            <p className="text-xs text-muted-foreground">
              Ambang auto-publish: skor {"≥"} {AUTO_PUBLISH_THRESHOLD} {"→"} Approved &amp; Published. Di bawah itu {"→"} Needs Revision.
            </p>
            <div className="flex items-center gap-2">
              <Input
                id="studio-score"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={scoreInput}
                onChange={(event) => setScoreInput(event.target.value)}
                className="w-28"
              />
              <Button onClick={handleSubmitVerdict} disabled={isSubmittingVerdict} size="sm">
                {isSubmittingVerdict ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Kirim Skor
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {canAdvance && (
            <Button onClick={handleAdvance} disabled={isAdvancing} variant="outline">
              {isAdvancing && <Loader2 className="h-4 w-4 animate-spin" />}
              Advance Stage
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
