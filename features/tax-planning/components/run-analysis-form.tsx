"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { runTaxPlanningAnalysisAction } from "../actions/tax-planning.actions";

function firstDayOfYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Kicks off one synchronous Tax Planning run (see runTaxPlanningAnalysisAction
 * -- no async job queue, the whole computation + narrative happens in this
 * one call). Defaults to year-to-date since PPh Badan is an annual tax, but
 * any period is allowed for quarterly/what-if planning discussions.
 */
export function RunAnalysisForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periodStart, setPeriodStart] = useState(firstDayOfYear());
  const [periodEnd, setPeriodEnd] = useState(today());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await runTaxPlanningAnalysisAction({ periodStart, periodEnd });
      if (!result.success) {
        toast.error(result.error ?? "Gagal menjalankan analisa");
        return;
      }
      toast.success("Analisa Tax Planning selesai");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="tp-period-start">Dari tanggal</Label>
        <Input id="tp-period-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tp-period-end">Sampai tanggal</Label>
        <Input id="tp-period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        Jalankan Analisa
      </Button>
    </form>
  );
}
