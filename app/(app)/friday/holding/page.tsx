import type { Metadata } from "next";
import { Building2, Lightbulb, Radar, Target, TrendingDown } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/constants/rbac";
import { AskHolding } from "@/features/friday/components/ask-holding";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getLatestHoldingBriefing, listHoldingBusinesses, type HoldingBriefingView, type HoldingBusinessView } from "@/repositories/holding.repository";

export const metadata: Metadata = { title: "FRIDAY — Holding Group" };

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

const HEALTH_BADGE: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  sehat: { label: "Sehat", variant: "success" },
  perlu_perhatian: { label: "Perlu perhatian", variant: "warning" },
  kritis: { label: "Kritis", variant: "destructive" },
  // Rendered as neutral, never as a bad grade. A unit whose dashboard did not
  // answer has not performed badly — it has not been read, and the two must
  // never look the same on this page.
  data_tidak_tersedia: { label: "Data tidak tersedia", variant: "outline" },
};

const IMPACT_BADGE: Record<string, "default" | "secondary" | "outline"> = { tinggi: "default", sedang: "secondary", rendah: "outline" };

/**
 * The holding group console.
 *
 * FRIDAY reading every business unit at once. Each unit keeps its own
 * dashboard, its own database, and its own operational system — this page is
 * not a replacement for any of them, and shows no unit's raw records. It shows
 * the group-level read: which unit is carrying the group, which needs
 * attention first, and whether a problem showing up in several units is one
 * problem or several.
 *
 * The business registry is rendered below the analysis, not above it. The
 * question a director opens this page with is "how is the group", not "what is
 * plugged in" — the wiring is reference material and sits where reference
 * material belongs.
 */
export default async function HoldingPage() {
  await requirePermission(PERMISSIONS.HOLDING_VIEW);
  const supabase = await createClient();

  const [briefing, businesses] = await Promise.all([getLatestHoldingBriefing(supabase), listHoldingBusinesses(supabase)]);
  const activeCount = businesses.filter((b) => b.status === "active").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holding Group"
        description="FRIDAY membaca seluruh unit bisnis sebagai satu grup. Setiap unit tetap berdiri sendiri — sumber kebenaran data ada di sistem operasional masing-masing."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Minta analisa grup</CardTitle>
          <CardDescription>
            Briefing grup berjalan otomatis setiap hari pukul 07:15 WITA, 45 menit setelah briefing unit Developer. {activeCount} unit bisnis aktif terdaftar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AskHolding />
        </CardContent>
      </Card>

      {!briefing ? (
        <EmptyState
          icon={Radar}
          title="Belum ada briefing grup"
          description="Briefing grup pertama dibuat otomatis pada jadwal harian berikutnya, atau jalankan analisa sekarang di atas."
        />
      ) : (
        <HoldingBriefingBody briefing={briefing} businesses={businesses} />
      )}

      <BusinessRegistry businesses={businesses} />
    </div>
  );
}

function HoldingBriefingBody({ briefing, businesses }: { briefing: HoldingBriefingView; businesses: HoldingBusinessView[] }) {
  if (briefing.status === "pending") {
    return <EmptyState icon={Radar} title="FRIDAY sedang membaca seluruh unit" description="Setiap Connector sedang dihubungi. Muat ulang halaman ini sebentar lagi." />;
  }

  if (briefing.status === "failed") {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base">Briefing grup gagal dibuat</CardTitle>
          <CardDescription>Dicoba pada {DATE_TIME_FORMAT.format(new Date(briefing.createdAt))} WITA. Antrian AI akan mencoba ulang otomatis.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{briefing.errorDetail ?? "Penyebab tidak tercatat."}</p>
        </CardContent>
      </Card>
    );
  }

  const severity = briefing.severity ? SEVERITY_BADGE[briefing.severity] : null;
  const nameByKey = new Map(businesses.map((b) => [b.key, b.name]));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-lg leading-snug">{briefing.headline}</CardTitle>
              <CardDescription>
                {briefing.generatedAt ? `${DATE_TIME_FORMAT.format(new Date(briefing.generatedAt))} WITA` : "—"}
                {briefing.triggerSource === "manual" ? " · analisa manual" : " · briefing grup harian"}
              </CardDescription>
            </div>
            {severity && <Badge variant={severity.variant}>{severity.label}</Badge>}
          </div>
        </CardHeader>
        {briefing.modelNote && (
          <CardContent>
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">Catatan kualitas analisa: {briefing.modelNote}</p>
          </CardContent>
        )}
      </Card>

      {briefing.businessHealth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Kondisi per unit bisnis
            </CardTitle>
            <CardDescription>Urut berdasarkan prioritas perhatian direksi. Unit yang datanya tidak terbaca ditandai netral, bukan dinilai buruk.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {briefing.businessHealth.map((entry) => {
              const health = HEALTH_BADGE[entry.status] ?? HEALTH_BADGE.data_tidak_tersedia;
              return (
                <div key={entry.businessKey} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-muted-foreground">#{entry.prioritas}</span>
                      <p className="font-medium">{nameByKey.get(entry.businessKey) ?? entry.businessKey}</p>
                    </div>
                    <Badge variant={health.variant}>{health.label}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{entry.ringkasan}</p>
                  <p className="mt-1 text-sm">{entry.temuanUtama}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Section title="Situasi" description="Kondisi grup secara keseluruhan" body={briefing.situasi} />
      <Section title="Analisa" description="Akar penyebab, dan apakah masalah beberapa unit itu satu masalah grup" body={briefing.analisa} />
      <Section title="Risiko" description="Risiko tingkat grup kalau tidak ada tindakan" body={briefing.risiko} icon={TrendingDown} />

      {briefing.solusi.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4" />
              Alternatif solusi
            </CardTitle>
            <CardDescription>Opsi tingkat grup beserta konsekuensinya masing-masing.</CardDescription>
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

      <Section title="Rekomendasi" description="Solusi terpilih dan alasannya mengalahkan alternatif lain" body={briefing.rekomendasi} icon={Target} />
      <Section title="Hasil yang diharapkan" description="Prediksi terukur di tingkat grup" body={briefing.hasilDiharapkan} />

      <p className="text-xs text-muted-foreground">
        Aksi yang diusulkan FRIDAY dari briefing ini muncul di halaman{" "}
        <a href="/friday" className="underline">
          FRIDAY
        </a>{" "}
        dan tetap membutuhkan persetujuan manusia sebelum berjalan.
      </p>
    </div>
  );
}

function BusinessRegistry({ businesses }: { businesses: HoldingBusinessView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Unit bisnis terdaftar</CardTitle>
        <CardDescription>
          Setiap unit dibaca lewat Connector-nya sendiri. FRIDAY tidak menyimpan data operasional unit mana pun — sumber kebenaran tetap di sistem masing-masing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {businesses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada unit bisnis terdaftar.</p>
        ) : (
          businesses.map((business) => (
            <div key={business.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{business.name}</p>
                <p className="text-xs text-muted-foreground">
                  {business.businessType} · connector {business.connectorKind}
                  {business.sourceSystem ? ` · sumber: ${business.sourceSystem}` : ""}
                  {business.baseUrl ? ` · ${business.baseUrl}` : ""}
                </p>
              </div>
              <Badge variant={business.status === "active" ? "success" : "outline"}>{business.status === "active" ? "Aktif" : "Nonaktif"}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, description, body, icon: Icon }: { title: string; description: string; body: string | null; icon?: typeof Target }) {
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
