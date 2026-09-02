import type { Metadata } from "next";
import { AlertTriangle, Calculator } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/constants/rbac";
import { AnalysisSummary } from "@/features/tax-planning/components/analysis-summary";
import { FiscalConfigForm } from "@/features/tax-planning/components/fiscal-config-form";
import { ProposalDeck } from "@/features/tax-planning/components/proposal-deck";
import { RunAnalysisForm } from "@/features/tax-planning/components/run-analysis-form";
import { hasPermission, requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { isMkhPropertiConfigured } from "@/lib/tax-planning/mkh-properti-client";
import { getFiscalConfig, listProposalsForAnalysis, listRecentTaxPlanningAnalyses } from "@/repositories/tax-planning.repository";

export const metadata: Metadata = { title: "Tax Planning" };

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Tax Planning — reads mkh-properti's real jurnal and estimates PPh Badan,
 * correctly separated between PPh Final Pasal 4(2) (property sales, PP
 * 34/2016 — excluded from the normal base) and normal PPh Badan on
 * everything else, with the cheaper of the Pasal 31E or PP 55/2022 regime
 * chosen where legally eligible. Every number on this page is computed in
 * lib/tax-planning/calculator.ts, never by the AI — the narrative paragraph
 * is the only thing Gemini writes, and only from numbers it's handed (see
 * lib/ai/domains/tax-planning.ts).
 *
 * Same shape as the FRIDAY console (app/(app)/friday/page.tsx): the run
 * form and disclaimer sit at the top, the latest analysis's numbers next,
 * then the usulan deck where a human with tax_planning.decide marks each
 * strategy accepted/rejected/needs-review. Nothing here files a tax return
 * or writes back into mkh-properti's ledger — every usulan explicitly says
 * so and asks for a licensed tax consultant's review before it becomes SPT
 * input.
 */
export default async function TaxPlanningPage() {
  const session = await requirePermission(PERMISSIONS.TAX_PLANNING_VIEW);
  const canRun = hasPermission(session, PERMISSIONS.TAX_PLANNING_RUN);
  const canDecide = hasPermission(session, PERMISSIONS.TAX_PLANNING_DECIDE);
  const canConfigure = hasPermission(session, PERMISSIONS.TAX_PLANNING_CONFIGURE);

  const supabase = await createClient();
  const [analyses, fiscalConfig] = await Promise.all([listRecentTaxPlanningAnalyses(supabase, 10), getFiscalConfig(supabase)]);
  const latest = analyses[0] ?? null;
  const proposals = latest && latest.status === "ready" ? await listProposalsForAnalysis(supabase, latest.id) : [];

  const configured = isMkhPropertiConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Planning"
        description="Estimasi PPh Badan dari jurnal mkh-properti — bukan pengganti konsultan pajak berlisensi."
      />

      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Semua angka di halaman ini adalah estimasi untuk bahan diskusi perencanaan pajak, dihitung otomatis dari jurnal mkh-properti. Ini
          BUKAN nasihat pajak resmi dan tidak menggantikan review konsultan pajak/akuntan berlisensi sebelum dipakai untuk pelaporan SPT
          Tahunan. Modul ini tidak pernah mengirim, melaporkan, atau mengubah data apa pun ke DJP atau ke jurnal mkh-properti.
        </span>
      </div>

      {!configured ? (
        <EmptyState
          icon={Calculator}
          title="Tax Planning belum dikonfigurasi"
          description="MKH_PROPERTI_SUPABASE_URL dan MKH_PROPERTI_SUPABASE_ANON_KEY belum diisi di environment. Hubungi Super Admin untuk mengaktifkan modul ini."
        />
      ) : (
        <>
          {canRun && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Jalankan Analisa Baru</CardTitle>
                <CardDescription>Pilih periode, sistem akan membaca jurnal mkh-properti pada rentang tanggal tersebut.</CardDescription>
              </CardHeader>
              <CardContent>
                <RunAnalysisForm />
              </CardContent>
            </Card>
          )}

          {!latest && (
            <EmptyState icon={Calculator} title="Belum ada analisa" description="Jalankan analisa pertama untuk melihat estimasi PPh Badan." />
          )}

          {latest && latest.status === "failed" && (
            <Card className="border-destructive/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-destructive">Analisa terakhir gagal</CardTitle>
                <CardDescription>
                  Periode {DATE_TIME_FORMAT.format(new Date(latest.periodStart))} – {DATE_TIME_FORMAT.format(new Date(latest.periodEnd))}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{latest.errorDetail}</CardContent>
            </Card>
          )}

          {latest && latest.status === "ready" && latest.computedResult && (
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-sm text-muted-foreground">
                  Analisa periode {DATE_TIME_FORMAT.format(new Date(latest.periodStart))} – {DATE_TIME_FORMAT.format(new Date(latest.periodEnd))}
                  {latest.requestedByName ? ` · diminta oleh ${latest.requestedByName}` : ""}
                </p>
                <AnalysisSummary result={latest.computedResult} />
              </div>

              {latest.narrative && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Ringkasan</CardTitle>
                  </CardHeader>
                  <CardContent className="whitespace-pre-wrap text-sm">{latest.narrative}</CardContent>
                </Card>
              )}

              <div>
                <h2 className="mb-3 text-lg font-semibold">Usulan Strategi</h2>
                <ProposalDeck proposals={proposals} canDecide={canDecide} />
              </div>
            </div>
          )}

          {canConfigure && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Konfigurasi Fiskal</CardTitle>
                <CardDescription>Data yang tidak bisa diturunkan dari jurnal — diisi manual dari riwayat SPT Tahunan perusahaan.</CardDescription>
              </CardHeader>
              <CardContent>
                <FiscalConfigForm config={fiscalConfig} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
