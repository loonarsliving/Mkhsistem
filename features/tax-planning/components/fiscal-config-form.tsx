"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FiscalConfig } from "@/lib/tax-planning/calculator";

import { updateFiscalConfigAction } from "../actions/tax-planning.actions";

/**
 * The facts mkh-properti's jurnal alone can't tell calculator.ts: the prior
 * fiscal loss balance and how many of the 3 UMKM-facility years have
 * already been used. These come from the company's actual filed SPT
 * history, so this is a manual, reviewed input -- not something the
 * calculator or the AI derives on its own.
 */
export function FiscalConfigForm({ config }: { config: FiscalConfig }) {
  const [isPending, startTransition] = useTransition();
  const [fiscalLoss, setFiscalLoss] = useState(String(config.fiscalLossCarryforwardIdr));
  const [umkmFirstYear, setUmkmFirstYear] = useState(config.umkmFinalTaxFirstEligibleYear?.toString() ?? "");
  const [umkmYearsUsed, setUmkmYearsUsed] = useState(String(config.umkmFinalTaxYearsUsed));
  const [threshold, setThreshold] = useState(String(config.annualTurnoverThresholdIdr));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateFiscalConfigAction({
        fiscalLossCarryforwardIdr: Number(fiscalLoss),
        umkmFinalTaxFirstEligibleYear: umkmFirstYear ? Number(umkmFirstYear) : null,
        umkmFinalTaxYearsUsed: Number(umkmYearsUsed),
        annualTurnoverThresholdIdr: Number(threshold),
      });
      if (!result.success) {
        toast.error(result.error ?? "Gagal menyimpan");
        return;
      }
      toast.success(result.data?.note ?? "Tersimpan");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="tp-loss">Sisa rugi fiskal dikompensasi (Rp)</Label>
        <Input id="tp-loss" type="number" min={0} value={fiscalLoss} onChange={(e) => setFiscalLoss(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tp-threshold">Ambang batas omzet Pasal 31E (Rp)</Label>
        <Input id="tp-threshold" type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tp-umkm-year">Tahun pertama memenuhi syarat PP 55/2022</Label>
        <Input id="tp-umkm-year" type="number" placeholder="mis. 2023" value={umkmFirstYear} onChange={(e) => setUmkmFirstYear(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tp-umkm-used">Tahun fasilitas PP 55/2022 sudah terpakai (maks. 3)</Label>
        <Input id="tp-umkm-used" type="number" min={0} max={3} value={umkmYearsUsed} onChange={(e) => setUmkmYearsUsed(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Simpan Konfigurasi Fiskal
        </Button>
      </div>
    </form>
  );
}
