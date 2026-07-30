import type { Metadata } from "next";
import { BedDouble, DoorOpen, Home, Sparkles, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getVillaDailyOccupancy, isVillaBridgeConfigured, type VillaDailyOccupancy } from "@/lib/villa/occupancy";
import { getKosOccupancy } from "@/repositories/kos-occupancy.repository";

export const metadata: Metadata = { title: "Okupansi Kos" };

export default async function KosOccupancyPage() {
  await requirePermission("kos_occupancy.view");

  const supabase = await createClient();
  // Kos (postgres_fdw) and Villa (file hub bridge) are independent sources —
  // fetched in parallel, and a failure on one never blanks the other.
  const villaConfigured = isVillaBridgeConfigured();
  const [kosResult, villaResult] = await Promise.allSettled([
    getKosOccupancy(supabase),
    villaConfigured ? getVillaDailyOccupancy() : Promise.reject(new Error("not configured")),
  ]);

  let properties: Awaited<ReturnType<typeof getKosOccupancy>> = [];
  let loadError: string | null = null;
  if (kosResult.status === "fulfilled") properties = kosResult.value;
  else loadError = kosResult.reason instanceof Error ? kosResult.reason.message : "Gagal memuat data Kos";

  let villa: VillaDailyOccupancy | null = null;
  let villaError: string | null = null;
  if (villaResult.status === "fulfilled") villa = villaResult.value;
  else if (villaConfigured) villaError = villaResult.reason instanceof Error ? villaResult.reason.message : "Gagal memuat data Villa";

  const total = properties.reduce((s, p) => s + p.total, 0);
  const terisi = properties.reduce((s, p) => s + p.terisi, 0);
  const kosong = properties.reduce((s, p) => s + p.kosong, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Okupansi Kos"
        description="Jumlah kamar terisi dan kosong, disinkron langsung dari aplikasi Kos — plus rangkuman okupansi harian Villa lewat jembatan file hub."
      />

      {loadError ? (
        <EmptyState icon={TriangleAlert} title="Data Kos tidak tersedia" description={loadError} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile icon={Home} label="Total Kamar" value={String(total)} />
            <StatTile icon={DoorOpen} label="Terisi" value={String(terisi)} tone="warning" />
            <StatTile icon={BedDouble} label="Kosong" value={String(kosong)} tone="success" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per Properti</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {properties.map((p) => (
                  <div key={p.propertyId} className="rounded-lg border border-border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{p.propertyName}</p>
                    <p className="mt-1 text-sm tabular-nums">
                      {p.terisi} terisi · {p.kosong} kosong · {p.total} total
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" aria-hidden />
            Villa — Rangkuman Okupansi Harian
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!villaConfigured ? (
            <p className="text-sm text-muted-foreground">
              Villa belum terhubung. Setel <code>FILEHUB_BRIDGE_SECRET</code> (dan nilai kembarannya di file hub) untuk menampilkan rangkuman harian dari
              aplikasi Villa.
            </p>
          ) : villaError ? (
            <p className="text-sm text-muted-foreground">Data Villa tidak tersedia: {villaError}</p>
          ) : villa ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <StatTile icon={Home} label="Total Unit" value={String(villa.total)} />
                <StatTile icon={DoorOpen} label="Terisi" value={String(villa.terisi)} tone="warning" />
                <StatTile icon={BedDouble} label="Kosong" value={String(villa.kosong)} tone="success" />
                <StatTile icon={Sparkles} label="Okupansi" value={`${villa.okupansiPersen}%`} />
              </div>
              <p className="text-sm tabular-nums text-muted-foreground">
                {villa.tanggal} · {villa.checkinHariIni} check-in hari ini · {villa.checkoutHariIni} check-out hari ini · {villa.kotor} unit sedang
                dibersihkan
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
