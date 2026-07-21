import type { Metadata } from "next";
import { BedDouble, DoorOpen, Home, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/rbac/session";
import { getKosOccupancy } from "@/repositories/kos-occupancy.repository";

export const metadata: Metadata = { title: "Okupansi Kos" };

export default async function KosOccupancyPage() {
  await requirePermission("kos_occupancy.view");

  let properties: Awaited<ReturnType<typeof getKosOccupancy>> = [];
  let loadError: string | null = null;
  try {
    properties = await getKosOccupancy();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Gagal memuat data Kos";
  }

  const total = properties.reduce((s, p) => s + p.total, 0);
  const terisi = properties.reduce((s, p) => s + p.terisi, 0);
  const kosong = properties.reduce((s, p) => s + p.kosong, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Okupansi Kos" description="Jumlah kamar terisi dan kosong, disinkron langsung dari aplikasi Kos." />

      {loadError ? (
        <EmptyState icon={TriangleAlert} title="Data tidak tersedia" description={loadError} />
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
    </div>
  );
}
