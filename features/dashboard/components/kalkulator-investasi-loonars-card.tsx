"use client";

import * as React from "react";
import { Calculator, Copy, MessageCircle, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copyToClipboard } from "@/lib/native/clipboard";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DEFAULT_AVERAGE_DAILY_RATE_IDR,
  DEFAULT_OPEX_PERCENT,
  DEFAULT_SCENARIOS,
  LOT_PRICE_IDR,
  MAX_LOTS,
  MIN_LOTS,
  QUICK_PRESET_LOTS,
  ROOMS_PER_PROJECT,
  ROOM_PRICE_IDR,
  SIMULATION_DISCLAIMER,
  TOTAL_PROJECT_LOTS,
  calculateInvestment,
  clampLots,
  estimateInvestorProfit,
  simulateProject,
  type InvestmentScenarioKey,
} from "@/lib/loonars/investment-calculator";

type OptionMode = "lot" | "full";

function formatPercent(value: number): string {
  return value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Sales-facing quick simulator (Yudha & Ayu, Jogja) for answering "kalau saya
 * invest X, dapat apa?" live over WhatsApp/telepon/tatap muka. Pure frontend
 * math (lib/loonars/investment-calculator.ts) -- no DB write, no server
 * round-trip, so it stays instant on a phone mid-chat. Occupancy/ADR/OPEX
 * are editable assumptions, never hardcoded results (see spec section 4).
 */
export function KalkulatorInvestasiLoonarsCard() {
  const [mode, setMode] = React.useState<OptionMode>("lot");
  const [lots, setLots] = React.useState(7);
  const [averageDailyRate, setAverageDailyRate] = React.useState(DEFAULT_AVERAGE_DAILY_RATE_IDR);
  const [opexPercent, setOpexPercent] = React.useState(DEFAULT_OPEX_PERCENT);
  const [scenarioKey, setScenarioKey] = React.useState<InvestmentScenarioKey>("moderat");

  const scenario = DEFAULT_SCENARIOS.find((s) => s.key === scenarioKey) ?? DEFAULT_SCENARIOS[1];
  const investment = calculateInvestment({ lots, isFullRoom: mode === "full" });
  const projectSimulation = simulateProject({
    averageDailyRateIdr: averageDailyRate,
    occupancyPercent: scenario.occupancyPercent,
    opexPercent,
  });
  const investorProfit = estimateInvestorProfit(projectSimulation.investorPoolIdr, investment.lots);

  function applyPreset(presetLots: number) {
    setMode(presetLots === MAX_LOTS ? "full" : "lot");
    setLots(presetLots);
  }

  function buildSummaryText(): string {
    return [
      "SIMULASI INVESTASI LOONARS",
      "",
      "Investasi:",
      formatCurrency(investment.investmentIdr),
      "",
      "Jumlah:",
      `${investment.lots} LOT`,
      "",
      "Equivalent:",
      `${formatPercent(investment.roomEquivalentPercent)}% dari 1 kamar`,
      "",
      "Estimasi Net Profit Proyek:",
      `${formatCurrency(projectSimulation.netProfitIdr)}/bulan`,
      "",
      "Estimasi Bagian Profit Investor:",
      `${formatCurrency(investorProfit.perMonthIdr)}/bulan`,
      "",
      "Estimasi Bagian Profit Investor:",
      `${formatCurrency(investorProfit.perYearIdr)}/tahun`,
      "",
      "Catatan:",
      "Simulasi berdasarkan asumsi dan bukan jaminan keuntungan.",
    ].join("\n");
  }

  async function handleCopy() {
    try {
      await copyToClipboard(buildSummaryText());
      toast.success("Ringkasan simulasi disalin");
    } catch {
      toast.error("Gagal menyalin ringkasan");
    }
  }

  function handleShareWhatsApp() {
    const message = [
      `Halo, berikut simulasi investasi Loonars untuk ${investment.lots} LOT (${formatCurrency(investment.investmentIdr)}):`,
      "",
      `- Equivalent: ${formatPercent(investment.roomEquivalentPercent)}% dari 1 kamar`,
      `- Estimasi bagian profit investor: ${formatCurrency(investorProfit.perMonthIdr)}/bulan (${formatCurrency(investorProfit.perYearIdr)}/tahun)`,
      "",
      "Simulasi berdasarkan asumsi dan bukan jaminan keuntungan. Detail lebih lanjut bisa kita bahas lebih lanjut.",
    ].join("\n");
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4" /> Kalkulator Investasi Loonars
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs value={mode} onValueChange={(v) => setMode(v as OptionMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="lot">LOT</TabsTrigger>
            <TabsTrigger value="full">FULL KAMAR</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "lot" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Jumlah Lot</p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={lots <= MIN_LOTS}
                onClick={() => setLots((v) => clampLots(v - 1))}
                aria-label="Kurangi lot"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-16 text-center text-2xl font-bold tabular-nums">{lots}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={lots >= MAX_LOTS}
                onClick={() => setLots((v) => clampLots(v + 1))}
                aria-label="Tambah lot"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">dari maks {MAX_LOTS} lot</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium">FULL KAMAR</p>
            <p className="text-xs text-muted-foreground">1 Kamar = {MAX_LOTS} LOT</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {QUICK_PRESET_LOTS.map((preset) => (
            <Button key={preset} type="button" variant="outline" size="sm" onClick={() => applyPreset(preset)}>
              {formatCurrency(preset * LOT_PRICE_IDR)}
            </Button>
          ))}
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Investasi Anda</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(investment.investmentIdr)}</p>
          <p className="text-sm font-medium">{investment.lots} LOT</p>
          <p className="text-xs text-muted-foreground">Equivalent {formatPercent(investment.roomEquivalentPercent)}% dari 1 kamar</p>
          {mode === "full" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Profit participation: {MAX_LOTS} LOT dari total {TOTAL_PROJECT_LOTS} LOT proyek (1/{ROOMS_PER_PROJECT} dari total project
              participation)
            </p>
          )}
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-semibold">Asumsi Simulasi</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="adr-input" className="text-xs font-medium text-muted-foreground">
                Harga Rata-Rata Kamar/Malam
              </label>
              <Input
                id="adr-input"
                type="number"
                min={0}
                step={10_000}
                value={averageDailyRate}
                onChange={(e) => setAverageDailyRate(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="opex-input" className="text-xs font-medium text-muted-foreground">
                OPEX (%)
              </label>
              <Input
                id="opex-input"
                type="number"
                min={0}
                max={100}
                step={1}
                value={opexPercent}
                onChange={(e) => setOpexPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Skenario Occupancy</p>
            <div className="grid grid-cols-3 gap-2">
              {DEFAULT_SCENARIOS.map((s) => (
                <Button
                  key={s.key}
                  type="button"
                  size="sm"
                  variant={s.key === scenarioKey ? "default" : "outline"}
                  onClick={() => setScenarioKey(s.key)}
                  className={cn("flex-col gap-0 py-2 text-xs")}
                >
                  <span>{s.label}</span>
                  <span className="font-normal opacity-80">{s.occupancyPercent}% occ.</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">Simulasi Bagian Profit</p>
          <p className="text-xs text-muted-foreground">
            Profit proyek dikumpulkan menjadi satu pool, dibagi proporsional berdasarkan jumlah lot ({ROOMS_PER_PROJECT} kamar x 15 lot ={" "}
            {TOTAL_PROJECT_LOTS} LOT total). Investor 70% · MKH 30%.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Gross Revenue</dt>
              <dd className="font-medium">{formatCurrency(projectSimulation.grossRevenueIdr)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Net Profit</dt>
              <dd className="font-medium">{formatCurrency(projectSimulation.netProfitIdr)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Investor Pool 70%</dt>
              <dd className="font-medium">{formatCurrency(projectSimulation.investorPoolIdr)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimasi Bagian Anda</p>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Per Bulan</span>
            <span className="text-lg font-bold">{formatCurrency(investorProfit.perMonthIdr)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Per Tahun</span>
            <span className="text-lg font-bold">{formatCurrency(investorProfit.perYearIdr)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="flex-1" onClick={handleCopy}>
            <Copy className="h-4 w-4" /> Copy Hasil
          </Button>
          <Button type="button" className="flex-1" onClick={handleShareWhatsApp}>
            <MessageCircle className="h-4 w-4" /> Kirim ke WhatsApp
          </Button>
        </div>

        <p className="text-xs italic text-muted-foreground">{SIMULATION_DISCLAIMER}</p>
        <p className="text-xs text-muted-foreground/70">
          Referensi: 1 lot = {formatCurrency(LOT_PRICE_IDR)} · 1 kamar = {MAX_LOTS} lot = {formatCurrency(ROOM_PRICE_IDR)}
        </p>
      </CardContent>
    </Card>
  );
}
