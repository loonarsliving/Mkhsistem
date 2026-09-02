import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only cross-project client into mkh-properti's own Supabase project --
 * a genuinely separate database (mkh-properti runs on its own Supabase
 * project, not this app's), reached over plain PostgREST with mkh-properti's
 * anon key. Never given write intent: Tax Planning only ever reads `jurnal`
 * to compute an estimate, it never writes back into mkh-properti's ledger
 * (that would make this app a second, competing writer into the books mkh-properti's
 * own KAP-reviewed jurnal is the system of record for).
 *
 * Server-only, same convention as lib/supabase/admin.ts -- never import this
 * from client code.
 */
function createMkhPropertiClient() {
  const url = process.env.MKH_PROPERTI_SUPABASE_URL;
  const anonKey = process.env.MKH_PROPERTI_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Tax Planning membutuhkan MKH_PROPERTI_SUPABASE_URL dan MKH_PROPERTI_SUPABASE_ANON_KEY (lihat .env.example) untuk membaca jurnal mkh-properti.",
    );
  }

  return createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface MkhJurnalRow {
  id: number;
  tgl: string;
  no: string | null;
  ket: string | null;
  akun: string;
  nama: string | null;
  proyek: string | null;
  d: number;
  k: number;
}

/**
 * Every jurnal row whose tanggal falls within [periodStart, periodEnd]
 * (inclusive, "YYYY-MM-DD"). mkh-properti's own DataProvider pulls the whole
 * table client-side with no server-side date filtering -- this does the
 * filtering here instead, since a tax period is a bounded range and there is
 * no reason to pull the entire company's ledger history for one analysis.
 */
export async function fetchMkhPropertiJurnal(periodStart: string, periodEnd: string): Promise<MkhJurnalRow[]> {
  const supabase = createMkhPropertiClient();

  const { data, error } = await supabase
    .from("jurnal")
    .select("id, tgl, no, ket, akun, nama, proyek, d, k")
    .gte("tgl", periodStart)
    .lte("tgl", periodEnd)
    .order("tgl", { ascending: true });

  if (error) {
    throw new Error(`Gagal membaca jurnal mkh-properti: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    tgl: String(row.tgl),
    no: row.no as string | null,
    ket: row.ket as string | null,
    akun: String(row.akun),
    nama: row.nama as string | null,
    proyek: row.proyek as string | null,
    d: Number(row.d ?? 0),
    k: Number(row.k ?? 0),
  }));
}

/** True when the module is configured and can be offered in the UI/actions. */
export function isMkhPropertiConfigured(): boolean {
  return Boolean(process.env.MKH_PROPERTI_SUPABASE_URL && process.env.MKH_PROPERTI_SUPABASE_ANON_KEY);
}
