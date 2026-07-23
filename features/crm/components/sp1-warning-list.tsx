"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileWarning, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";

import { reviewSp1WarningAction } from "../actions/crm.actions";
import { listSp1WarningsAction } from "../actions/crm-query.actions";

const STATUS_LABEL: Record<string, { label: string; variant: "secondary" | "default" | "success" | "destructive" }> = {
  pending_ai: { label: "AI sedang menyusun draft", variant: "secondary" },
  pending_review: { label: "Menunggu Review", variant: "default" },
  approved: { label: "Disetujui", variant: "success" },
  rejected: { label: "Ditolak", variant: "destructive" },
};

export function Sp1WarningList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["crm-sp1-warnings"], queryFn: listSp1WarningsAction });
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null);
  const [rejectNote, setRejectNote] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function handleApprove(id: string) {
    setBusyId(id);
    const result = await reviewSp1WarningAction({ id, decision: "approved" });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyetujui SP1");
      return;
    }
    toast.success("SP1 disetujui dan diterbitkan ke sales");
    queryClient.invalidateQueries({ queryKey: ["crm-sp1-warnings"] });
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget);
    const result = await reviewSp1WarningAction({ id: rejectTarget, decision: "rejected", note: rejectNote || undefined });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menolak SP1");
      return;
    }
    toast.success("Draft SP1 ditolak");
    setRejectTarget(null);
    setRejectNote("");
    queryClient.invalidateQueries({ queryKey: ["crm-sp1-warnings"] });
  }

  const items = data ?? [];

  if (!isLoading && items.length === 0) {
    return <EmptyState icon={FileWarning} title="Belum ada SP1" description="AI akan membuat draft SP1 otomatis setiap 3 hari jika ada sales tanpa closing dan prospek stuck." />;
  }

  return (
    <div className="space-y-4">
      {items.map((w) => {
        const statusInfo = STATUS_LABEL[w.status] ?? { label: w.status, variant: "secondary" as const };
        return (
          <Card key={w.id}>
            <CardContent className="space-y-3 p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{w.salesName}</p>
                  <p className="text-sm text-muted-foreground">
                    {w.branchName} &middot; Periode {w.period_month}/{w.period_year}
                  </p>
                </div>
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{w.reason}</p>
              {w.ai_draft_content && (
                <Textarea value={w.ai_draft_content} readOnly rows={10} className="font-mono text-xs" />
              )}
              {w.status === "pending_review" && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="text-destructive" disabled={busyId === w.id} onClick={() => setRejectTarget(w.id)}>
                    <XCircle className="h-4 w-4" /> Tolak
                  </Button>
                  <Button size="sm" disabled={busyId === w.id} onClick={() => handleApprove(w.id)}>
                    <CheckCircle2 className="h-4 w-4" /> Setujui &amp; Terbitkan
                  </Button>
                </div>
              )}
              {w.review_note && <p className="text-xs text-muted-foreground">Catatan review: {w.review_note}</p>}
            </CardContent>
          </Card>
        );
      })}

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        title="Tolak draft SP1 ini?"
        description="Sales tidak akan diberi tahu bahwa SP1 pernah dipertimbangkan."
        confirmLabel="Tolak SP1"
        destructive
        loading={busyId === rejectTarget}
        onConfirm={handleReject}
      >
        <Textarea placeholder="Alasan penolakan (opsional)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={2} />
      </ConfirmDialog>
    </div>
  );
}
