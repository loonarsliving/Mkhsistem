import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Clock, Eye, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getVisionStatusCounts, listVisionOutstanding } from "@/repositories/kontenai-vision-status.repository";

export const metadata: Metadata = { title: "Gemini Vision" };

const STATUS_LABEL: Record<string, string> = {
  not_analyzed: "Menunggu antrean",
  pending: "Sedang dianalisis",
  failed: "Gagal",
  completed: "Selesai",
};

/**
 * Real Gemini Vision queue status.
 *
 * This page used to render a prototype backed by mock-db.ts: its "Analisis
 * Semua" button produced fake analysis text in an in-memory store and never
 * wrote to kontenai_assets, so it reported success over footage that had
 * never actually been analyzed. Analysis now runs in the background
 * (kontenai_vision_dispatch_pending, every 5 minutes -- migration 0185), so
 * this page's job is to report that queue honestly rather than offer a button
 * that lies.
 */
export default async function GeminiVisionPage() {
  await requireKontenAiAccess();
  const supabase = await createClient();

  const [counts, outstanding] = await Promise.all([
    getVisionStatusCounts(supabase),
    listVisionOutstanding(supabase),
  ]);

  const readyPercent = counts.total === 0 ? 0 : Math.round((counts.completed / counts.total) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gemini Vision"
        description="Aset mana yang sudah pernah dianalisis Gemini Vision. Analisis berjalan sebagai bagian dari produksi video — Asset Selector memilih footage sesuai brief, lalu footage terpilih itulah yang dianalisis. Google Drive hanya penyimpanan."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kesiapan Asset Library</CardTitle>
          <CardDescription>
            Analisis Gemini Vision terjadi saat footage dipilih untuk sebuah video, bukan sebagai proses massal atas
            seluruh isi Drive.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={CircleCheck}
            label={`Selesai (${readyPercent}% dari total)`}
            value={String(counts.completed)}
            tone={readyPercent >= 80 ? "success" : "warning"}
          />
          <StatTile
            icon={Clock}
            label="Menunggu antrean"
            value={String(counts.notAnalyzed)}
            tone={counts.notAnalyzed > 0 ? "warning" : "success"}
          />
          <StatTile icon={Eye} label="Sedang dianalisis" value={String(counts.pending)} />
          <StatTile
            icon={TriangleAlert}
            label="Gagal"
            value={String(counts.failed)}
            tone={counts.failed > 0 ? "destructive" : "success"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kesiapan per brand</CardTitle>
          <CardDescription>
            Villa (occupancy) dan Beauty adalah dua lini yang diotomasi KontenAI. Angka ini menunjukkan footage yang
            sudah pernah dipakai dan dianalisis, bukan target yang harus dipenuhi lebih dulu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {counts.byCompany.length === 0 ? (
            <EmptyState icon={Eye} title="Belum ada aset" description="Asset Library masih kosong." className="py-8" />
          ) : (
            <ul className="divide-y divide-border">
              {counts.byCompany.map((row) => (
                <li key={row.company} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate font-medium">{row.company}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {row.completed} / {row.total} dianalisis
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Belum pernah dianalisis</CardTitle>
          <CardDescription>
            Ini <strong>bukan</strong> tumpukan pekerjaan. Aset baru dianalisis ketika Asset Selector memilihnya untuk
            sebuah video, jadi wajar kalau sebagian besar footage di Drive belum pernah dianalisis. Aset berstatus{" "}
            <strong>Gagal</strong> bisa diulangi lewat tombol per aset di{" "}
            <Link href="/kontenai/asset-library" className="underline underline-offset-2">
              Asset Library
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {outstanding.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              title="Semua aset pernah dianalisis"
              description="Setiap footage di Asset Library sudah pernah dipakai dalam produksi."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-border">
              {outstanding.map((asset) => (
                <li key={asset.id} className="space-y-1 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{asset.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {asset.assetType}
                    </Badge>
                    {asset.company && (
                      <Badge variant="outline" className="text-xs">
                        {asset.company}
                      </Badge>
                    )}
                    <Badge variant={asset.status === "failed" ? "destructive" : "outline"} className="text-xs">
                      {STATUS_LABEL[asset.status] ?? asset.status}
                    </Badge>
                  </div>
                  {asset.error && <p className="text-xs text-destructive">{asset.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
