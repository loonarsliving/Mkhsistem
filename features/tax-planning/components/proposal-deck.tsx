"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, ShieldQuestion, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TaxPlanningProposal } from "@/repositories/tax-planning.repository";

import { decideTaxProposalAction } from "../actions/tax-planning.actions";

const CONFIDENCE_LABEL: Record<TaxPlanningProposal["confidence"], string> = {
  tinggi: "Keyakinan tinggi",
  sedang: "Keyakinan sedang",
  rendah: "Keyakinan rendah",
};

const STATUS_BADGE: Record<TaxPlanningProposal["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  proposed: { label: "Menunggu keputusan", variant: "secondary" },
  accepted: { label: "Diterima sebagai bahan diskusi", variant: "default" },
  rejected: { label: "Ditolak", variant: "destructive" },
  needs_review: { label: "Perlu ditinjau lebih lanjut", variant: "outline" },
};

function idr(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

/**
 * Every card here mirrors FRIDAY's action-deck.tsx on purpose: an usulan is
 * text and a number, never something that runs. Accepting one only marks it
 * "accepted as planning input" -- it never files, submits, or changes any
 * value in mkh-properti's ledger. requiresProfessionalReview is always
 * shown, never hidden, because nothing this module proposes is a finished
 * answer without a licensed tax consultant looking at it first.
 */
export function ProposalDeck({ proposals, canDecide }: { proposals: TaxPlanningProposal[]; canDecide: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function decide(proposalId: string, decision: "accept" | "reject" | "needs_review") {
    setBusyId(proposalId);
    startTransition(async () => {
      const result = await decideTaxProposalAction({ proposalId, decision });
      setBusyId(null);
      if (!result.success) {
        toast.error(result.error ?? "Gagal menyimpan keputusan");
        return;
      }
      toast.success(result.data?.note ?? "Keputusan tersimpan");
    });
  }

  if (proposals.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada usulan strategi untuk periode ini.</p>;
  }

  return (
    <div className="space-y-3">
      {proposals.map((p) => {
        const isOpen = p.status === "proposed";
        const badge = STATUS_BADGE[p.status];
        return (
          <div key={p.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="font-medium">{p.title}</p>
                <p className="text-sm text-muted-foreground">{p.description}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={badge.variant}>{badge.label}</Badge>
                <span className="text-xs text-muted-foreground">{CONFIDENCE_LABEL[p.confidence]}</span>
                {p.estimatedImpactIdr !== null && <span className="text-xs font-medium text-success">Potensi dampak: {idr(p.estimatedImpactIdr)}</span>}
              </div>
            </div>

            {p.requiresProfessionalReview && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500">
                <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
                Bukan nasihat pajak final -- validasi dengan konsultan pajak/akuntan berlisensi sebelum dipakai untuk pelaporan SPT.
              </p>
            )}

            {p.decisionNote && <p className="mt-2 text-xs text-muted-foreground">Catatan: {p.decisionNote}</p>}
            {p.decidedByName && !isOpen && <p className="mt-1 text-xs text-muted-foreground">Diputuskan oleh {p.decidedByName}</p>}

            {isOpen && canDecide && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" disabled={isPending && busyId === p.id} onClick={() => decide(p.id, "accept")}>
                  {busyId === p.id && isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Terima sebagai bahan diskusi
                </Button>
                <Button size="sm" variant="outline" disabled={isPending && busyId === p.id} onClick={() => decide(p.id, "needs_review")}>
                  <ShieldQuestion className="size-4" />
                  Perlu ditinjau
                </Button>
                <Button size="sm" variant="ghost" disabled={isPending && busyId === p.id} onClick={() => decide(p.id, "reject")}>
                  <X className="size-4" />
                  Tolak
                </Button>
              </div>
            )}

            {isOpen && !canDecide && <p className="mt-3 text-xs text-muted-foreground">Anda tidak memiliki wewenang untuk memutuskan usulan ini.</p>}
          </div>
        );
      })}
    </div>
  );
}
