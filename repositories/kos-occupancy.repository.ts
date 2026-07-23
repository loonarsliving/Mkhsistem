import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Kos is integrated at the database level, not through an API call: a
 * postgres_fdw foreign server (`kos_server`) connects this project directly
 * to the Kos app's Supabase Postgres instance (gluoioiimapyhchdasfl), with
 * its operational tables imported into the `kos_remote` schema (see
 * migration 0145). `get_kos_occupancy()` reads those foreign tables and is
 * permission-gated the same way every other RPC in this app is.
 */
export interface KosPropertyOccupancy {
  propertyId: string;
  propertyName: string;
  total: number;
  terisi: number;
  kosong: number;
}

export async function getKosOccupancy(supabase: TypedSupabaseClient): Promise<KosPropertyOccupancy[]> {
  const { data, error } = await supabase.rpc("get_kos_occupancy");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    propertyId: row.property_id,
    propertyName: row.property_name,
    total: row.total,
    terisi: row.terisi,
    kosong: row.kosong,
  }));
}
