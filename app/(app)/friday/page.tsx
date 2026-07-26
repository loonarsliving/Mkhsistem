import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Lightbulb, Radar, Target, TrendingDown } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/constants/rbac";
import { ActionDeck } from "@/features/friday/components/action-deck";
import { AskFriday } from "@/features/friday/components/ask-friday";
import { hasPermission, requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getBriefingById, getLatestBriefing, listRecentBriefings, type FridayBriefingView } from "@/repositories/friday.repository";

export const metadata: Metadata = { title: "FRIDAY — Executive Intelligence" };

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Makassar",
});

const SEVERITY_BADGE: Record<string, { label: string; variant: "success" | "warning" | "destructive" }> = {
  normal: { label: "Normal", variant: "success" },
  perhatian: { label: "Perlu perhatian", variant: "warning" },
  kritis: { label: "Kritis", variant: "destructive" },
};

const IMPACT_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  tinggi: "default",
  sedang: "secondary",
  rendah: "outline",
};

/**
 * FRIDAY — the executive intelligence console.
 *
 * Everything else in MK Connect answers a question inside one domain. This
 * page is the only place the company is read as one thing: CRM, ads, finance,
 * HR, Markom, occupancy, and automation health go into a single analysis, and
 * what comes out is a decision with its reasoning attached.
 *
 * The page is laid out in the order the reasoning runs — situation, cause,
 * risk of inaction, the alternatives that were weighed, the recommendation
 * and why it beat the others, then the actions available to execute it. That
 * ordering is the product: a reader who stops after the second card has still
 * learned the thing that matters, and a reader who disagrees with the
 * recommendation can see exactly which alternative they would rather take.
 *
 * Deliberately not a chat. A conversation invites the model to be agreeable;
 * a briefing has to stand on its own and be judged.
 */
export default async function FridayPage({ searchParams }: { searchParams: Promise<{ briefing?: string }> }) {
  const session = await requirePermission(PERMISSIONS.FRIDAY_VIEW);
  const supabase = await createClient();
  const { briefing: briefingParam } = await searchParams;

  const [briefing, history] = await Promise.all([
    briefingParam ? getBriefingById(supabase, briefingParam) : getLatestBriefing(supabase),
    listRecentBriefings(supabase),
  ]);

  const canRun = hasPermission(session, PERMISSIONS.FRIDAY_RUN);
  const canDecide = hasPermission(session, PERMISSIONS.FRIDAY_ACTION_DECIDE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="FRIDAY"
        description="Executive Intelligence Layer — membaca seluruh data MKH System sebagai satu kesatuan, mencari akar masalah, dan mengusulkan keputusan."
      />

      {canRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Minta analisa sekarang</CardTitle>
            <CardDescription>Briefing otomatis berjalan setiap hari pukul 06:30 WITA. Gunakan ini kalau ada yang perlu dianalisa sekarang.</CardDescription>
          </CardHeader>
          <CardContent>
            <AskFriday />
          </CardContent>
        </Card>
      )}

      {!briefing ? (
        <EmptyState
          icon={Radar}
          title="Belum ada briefing"
          description={
            canRun
              ? "Briefing eksekutif pertama akan dibuat otomatis pada jadwal harian berikutnya, atau jalankan analisa sekarang di atas."
              : "Briefing eksekutif dibuat otomatis setiap hari pukul 06:30 WITA."
          }
        />
      ) : (
        <BriefingBody briefing={briefing} canDecide={canDecide} />
      )}

      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Riwayat briefing</CardTitle>
            <CardDescription>Analisa sebelumnya, beserta severity saat itu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {history.map((item) => {
              const severity = item.severity ? SEVERITY_BADGE[item.severity] : null;
              const isCurrent = briefing?.id === item.id;
              return (
                <Link
                  key={item.id}
                  href={`/friday?briefing=${item.id}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted ${isCurrent ? "bg-muted" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.headline ?? (item.status === "failed" ? "Briefing gagal" : "Sedang dianalisa...")}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {severity && <Badge variant={severity.variant}>{severity.label}</Badge>}
                    {item.triggerSource === "manual" && <Badge variant="outline">Manual</Badge>}
                    <span className="text-xs text-muted-foreground">{DATE_TIME_FORMAT.format(new Date(item.createdAt))}</span>
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BriefingBody({ briefing, canDecide }: { briefing: FridayBriefingView; canDecide: boolean }) {
  if (briefing.status === "pending") {
    return (
      <EmptyState
        icon={Radar}
        title="FRIDAY sedang menganalisa"
        description="Snapshot lintas domain sedang dibaca dan dianalisa. Muat ulang halaman ini sebentar lagi."
      />
    );
  }

  if (briefing.status === "failed") {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-destructive" />
            Briefing gagal dibuat
          </CardTitle>
          <CardDescription>
            Dicoba pada {DATE_TIME_FORMAT.format(new Date(briefing.createdAt))} WITA. Analisa akan dicoba ulang otomatis oleh antrian AI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{briefing.errorDetail ?? "Penyebab tidak tercatat."}</p>
        </CardContent>
      </Card>
    );
  }

  const severity = briefing.severity ? SEVERITY_BADGE[briefing.severity] : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-lg leading-snug">{briefing.headline}</CardTitle>
              <CardDescription>
                {briefing.generatedAt ? `${DATE_TIME_FORMAT.format(new Date(briefing.generatedAt))} WITA` : "—"}
                {briefing.triggerSource === "manual" ? " · analisa manual" : " · briefing harian"}
              </CardDescription>
            </div>
            {severity && <Badge variant={severity.variant}>{severity.label}</Badge>}
          </div>
        </CardHeader>
        {briefing.modelNote && (
          <CardContent>
            {/* Surfaced rather than hidden: a briefing that came back with two
                alternatives instead of three is still useful, but the reader
                should know it was incomplete before treating it as thorough. */}
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
              Catatan kualitas analisa: {briefing.modelNote}
            </p>
          </CardContent>
        )}
      </Card>

      <Section title="Situasi" description="Apa yang sedang terjadi" body={briefing.situasi} />
      <Section title="Analisa" description="Mengapa hal itu terjadi — akar penyebabnya" body={briefing.analisa} />
      <Section title="Risiko" description="Apa yang terjadi kalau tidak ada tindakan" body={briefing.risiko} icon={TrendingDown} />

      {briefing.solusi.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4" />
              Alternatif solusi
            </CardTitle>
            <CardDescription>Opsi yang dipertimbangkan beserta konsekuensinya masing-masing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {briefing.solusi.map((solution, index) => (
              <div key={`${solution.judul}-${index}`} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-snug">{solution.judul}</p>
                  <Badge variant={IMPACT_BADGE[solution.dampak] ?? "outline"}>{solution.dampak}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{solution.ringkasan}</p>
                <dl className="space-y-1 text-xs">
                  <Detail label="Keuntungan" value={solution.keuntungan} />
                  <Detail label="Kerugian" value={solution.kerugian} />
                  <Detail label="Biaya" value={solution.biaya_estimasi} />
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Section title="Rekomendasi" description="Solusi yang dipilih dan alasannya mengalahkan alternatif lain" body={briefing.rekomendasi} icon={Target} />
      <Section title="Hasil yang diharapkan" description="Prediksi terukur setelah rekomendasi dijalankan" body={briefing.hasilDiharapkan} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action</CardTitle>
          <CardDescription>
            Automation MKH System yang diusulkan FRIDAY. Tidak ada yang berjalan sebelum disetujui manusia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionDeck actions={briefing.actions} canDecide={canDecide} />
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  description,
  body,
  icon: Icon,
}: {
  title: string;
  description: string;
  body: string | null;
  icon?: typeof Target;
}) {
  if (!body) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon && <Icon className="size-4" />}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-line text-sm leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium text-muted-foreground">{label}:</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
