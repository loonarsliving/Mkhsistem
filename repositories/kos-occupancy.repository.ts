/**
 * Read-only integration with the Kos app's `kos-api` Edge Function (a
 * separate Supabase project -- gluoioiimapyhchdasfl, shared with MKH
 * Property). This module only needs "how many rooms are filled vs empty",
 * so it calls the existing `/summary` endpoint per property instead of
 * standing up cross-project sync infrastructure for a read-only counter.
 */

export interface KosPropertyOccupancy {
  propertyId: string;
  propertyName: string;
  total: number;
  terisi: number;
  kosong: number;
}

const KOS_PROPERTIES = [
  { id: "20c0c9b0-f047-42bf-9e5e-6a49bc00b167", name: "Kos Gito Gati Premium" },
  { id: "c3519642-863c-4390-a158-504439bcf2dc", name: "Loonars Private Living" },
] as const;

interface KosSummaryResponse {
  available: number;
  occupied: number;
  dirty: number;
  total: number;
}

async function fetchPropertySummary(propertyId: string): Promise<KosSummaryResponse> {
  const apiUrl = process.env.KOS_API_URL;
  const apiToken = process.env.KOS_API_TOKEN;
  if (!apiUrl || !apiToken) {
    throw new Error("KOS_API_URL / KOS_API_TOKEN belum diset -- lihat .env.example");
  }

  const res = await fetch(`${apiUrl}/summary?property_id=${propertyId}`, {
    headers: { "x-kos-token": apiToken },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gagal memuat data Kos (${res.status})`);
  return res.json();
}

export async function getKosOccupancy(): Promise<KosPropertyOccupancy[]> {
  return Promise.all(
    KOS_PROPERTIES.map(async (property) => {
      const summary = await fetchPropertySummary(property.id);
      return {
        propertyId: property.id,
        propertyName: property.name,
        total: summary.total,
        kosong: summary.available,
        terisi: summary.total - summary.available,
      };
    }),
  );
}
