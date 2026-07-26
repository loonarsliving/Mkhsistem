"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Play, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FridayActionView } from "@/repositories/friday.repository";

import { decideFridayActionAction } from "../actions/friday.actions";

const RISK_LABEL: Record<string, string> = {
  low: "Risiko rendah",
  medium: "Risiko sedang",
  high: "Risiko tinggi",
};

const STATUS_LABEL: Record<string, string> = {
  proposed: "Menunggu keputusan",
  approved: "Disetujui",
  rejected: "Ditolak",
  executed: "Sudah dijalankan",
  failed: "Gagal dijalankan",
};

interface ActionDeckProps {
  actions: FridayActionView[];
  /** False for a viewer holding friday.view but not friday.action_decide — they see the proposals and the reasoning, but no buttons. */
  canDecide: boolean;
}

/**
 * The approval surface — the point where FRIDAY's reasoning becomes something
 * that actually happens.
 *
 * Deliberately unglamorous. Each card shows what would run, why FRIDAY thinks
 * so, and the exact parameters it would run with, because an approver who
 * cannot see the payload is not really approving anything. The high-risk
 * warning is rendered from the catalog's own tier, never from anything the
 * model wrote.
 */
export function ActionDeck({ actions, canDecide }: ActionDeckProps) {
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function decide(actionId: string, decision: "approve" | "reject") {
    setBusyId(actionId);
    startTransition(async () => {
      const result = await decideFridayActionAction({ actionId, decision });
      setBusyId(null);
      if (!result.success) {
        toast.error(result.error ?? "Gagal memproses aksi");
        return;
      }
      toast.success(result.data?.note ?? (decision === "approve" ? "Aksi dijalankan" : "Aksi ditolak"));
    });
  }

  if (actions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        FRIDAY tidak mengusulkan aksi otomatis untuk briefing ini. Tindakan yang perlu dilakukan ada di bagian Rekomendasi.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {actions.map((action) => {
        const isOpen = action.status === "proposed";
        const payloadEntries = Object.entries(action.payload);
        return (
          <div key={action.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="font-medium">{action.title}</p>
                <p className="text-sm text-muted-foreground">{action.rationale}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={action.status === "failed" ? "destructive" : action.status === "executed" ? "default" : "secondary"}>
                  {STATUS_LABEL[action.status] ?? action.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{RISK_LABEL[action.riskTier] ?? action.riskTier}</span>
              </div>
            </div>

            {payloadEntries.length > 0 && (
              <dl className="mt-3 space-y-1 rounded-md bg-muted/50 p-3 text-xs">
                {payloadEntries.map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="shrink-0 font-medium text-muted-foreground">{key}:</dt>
                    <dd className="break-words">{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                  </div>
                ))}
              </dl>
            )}

            {action.riskTier === "high" && isOpen && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Aksi ini berdampak langsung ke pihak luar atau biaya. Pastikan Anda membaca payload di atas sebelum menyetujui.
              </p>
            )}

            {action.executionNote && (
              <p className={`mt-3 text-xs ${action.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{action.executionNote}</p>
            )}

            {isOpen && canDecide && (
              <div className="mt-4 flex gap-2">
                <Button size="sm" disabled={isPending && busyId === action.id} onClick={() => decide(action.id, "approve")}>
                  {busyId === action.id && isPending ? <Play className="size-4 animate-pulse" /> : <Check className="size-4" />}
                  Setujui &amp; jalankan
                </Button>
                <Button size="sm" variant="outline" disabled={isPending && busyId === action.id} onClick={() => decide(action.id, "reject")}>
                  <X className="size-4" />
                  Tolak
                </Button>
              </div>
            )}

            {isOpen && !canDecide && <p className="mt-3 text-xs text-muted-foreground">Anda tidak memiliki wewenang untuk menyetujui aksi.</p>}
          </div>
        );
      })}
    </div>
  );
}
