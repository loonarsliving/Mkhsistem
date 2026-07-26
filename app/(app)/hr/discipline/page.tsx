import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DisciplinePanel } from "@/features/hr-discipline/components/discipline-panel";
import { REASON_LABELS, type REASON_CATEGORIES } from "@/features/hr-discipline/schemas/hr-discipline.schema";
import { hasPermission, requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listDisciplinaryActions, listDisciplineCandidates } from "@/repositories/hr-discipline.repository";

export const metadata: Metadata = { title: "Disiplin & Pemberhentian" };

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

const TYPE_LABEL: Record<string, string> = {
  sp1: "SP1",
  sp2: "SP2",
  sp3: "SP3",
  termination: "Pemberhentian",
};

export default async function HrDisciplinePage() {
  const session = await requirePermission("hr_discipline.view");
  const supabase = await createClient();

  const canWarn = hasPermission(session, "hr_discipline.warn");
  const canTerminate = hasPermission(session, "hr_discipline.terminate");

  const [history, candidates] = await Promise.all([
    listDisciplinaryActions(supabase),
    canWarn ? listDisciplineCandidates(supabase) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disiplin & Pemberhentian"
        description="Surat peringatan dan pemberhentian, lengkap dengan data pendukung yang tersimpan permanen."
      />

      {canWarn && <DisciplinePanel candidates={candidates} canTerminate={canTerminate} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" />
            Riwayat
          </CardTitle>
          <CardDescription>
            Setiap surat menyimpan data kehadiran pada saat diterbitkan, bukan data terkini — catatan tidak berubah
            kalau absensi dikoreksi belakangan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Belum ada catatan"
              description="Belum ada surat peringatan atau pemberhentian yang diterbitkan."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-border">
              {history.map((item) => (
                <li key={item.id} className="space-y-1.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.actionType === "termination" ? "destructive" : "default"}>
                      {TYPE_LABEL[item.actionType] ?? item.actionType}
                    </Badge>
                    <span className="text-sm font-medium">{item.employeeName}</span>
                    {item.branchName && <span className="text-xs text-muted-foreground">{item.branchName}</span>}
                    <Badge variant="outline" className="text-xs">
                      {REASON_LABELS[item.reasonCategory as (typeof REASON_CATEGORIES)[number]] ?? item.reasonCategory}
                    </Badge>
                    {item.status === "revoked" && <Badge variant="outline">Dicabut</Badge>}
                    {item.bypassedLadder && <Badge variant="destructive">Tanpa tahapan SP</Badge>}
                  </div>

                  <p className="text-sm text-muted-foreground">{item.description}</p>

                  {item.evidence && (
                    <p className="text-xs text-muted-foreground">
                      Saat diterbitkan — alpha 30 hari: {item.evidence.alpha_30d}, telat 30 hari: {item.evidence.late_30d},
                      alpha 90 hari: {item.evidence.alpha_90d}, SP aktif: {item.evidence.active_warnings}
                    </p>
                  )}

                  {item.bypassJustification && (
                    <p className="rounded border-l-2 border-destructive pl-2 text-xs text-muted-foreground">
                      Justifikasi: {item.bypassJustification}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {DATE_FORMAT.format(new Date(item.effectiveDate))}
                    {item.lastWorkingDate && ` · hari kerja terakhir ${DATE_FORMAT.format(new Date(item.lastWorkingDate))}`}
                    {item.issuedByName && ` · oleh ${item.issuedByName}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
