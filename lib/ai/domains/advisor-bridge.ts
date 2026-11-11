/**
 * Jembatan ke Loonars AI Advisor (layanan mandiri di repo Istri, D-2026-005/006).
 *
 * Asisten owner WA (super admin saja) meneruskan pesan yang diawali
 * "advisor" / "mentor" APA ADANYA ke layanan advisor, lalu langsung membalas
 * "sedang diproses". Jawaban advisor menyusul lewat /api/wa/send (rahasia
 * ADVISOR_BRIDGE_SECRET). Tidak ada AI MK Connect yang dipakai di jalur ini:
 * advisor memakai kunci Gemini-nya sendiri; model & kunci MK Connect tidak berubah.
 */

const AWALAN_ADVISOR = /^\s*(advisor|mentor|loonars advisor)\b/i;

export function isAdvisorMessage(question: string): boolean {
  return AWALAN_ADVISOR.test(question);
}

export const ADVISOR_DITERIMA_TEXT = "⏳ Advisor sedang menyusun jawaban, hasilnya menyusul di chat ini (biasanya 1–2 menit).";
export const ADVISOR_BELUM_TERSAMBUNG_TEXT = "Advisor belum tersambung (konfigurasi layanan advisor belum lengkap).";
export const ADVISOR_GAGAL_TEXT = "⚠️ Advisor sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.";

export async function forwardToAdvisor(
  sender: string,
  question: string,
  opts: { url?: string; secret?: string; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const url = (opts.url ?? process.env.ADVISOR_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
  const secret = (opts.secret ?? process.env.ADVISOR_BRIDGE_SECRET ?? "").trim();
  if (!url || secret.length < 32) return ADVISOR_BELUM_TERSAMBUNG_TEXT;
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${url}/api/advisor/pesan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-advisor-bridge-secret": secret },
      body: JSON.stringify({ nomor: sender, pesan: question }),
      signal: AbortSignal.timeout(15000),
    });
    return res.status === 202 || res.ok ? ADVISOR_DITERIMA_TEXT : ADVISOR_GAGAL_TEXT;
  } catch {
    return ADVISOR_GAGAL_TEXT;
  }
}
