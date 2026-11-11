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

/**
 * D-2026-007: pertanyaan/diskusi bebas owner otomatis ke advisor; perintah
 * operasional & pencarian data cepat tetap di asisten owner lama. Deterministik
 * (tanpa AI MK Connect, tanpa biaya). Ragu → tetap asisten lama.
 */
const SINYAL_DISKUSI = /\b(harus|sebaiknya|seharusnya|menurut(mu| kamu| anda)?|saran(mu)?|strategi|fokus|prioritas|rencana|keputusan|putuskan|boleh (tidak|nggak|gak|ga)|bolehkah|bagaimana (kalau|jika|cara|sebaiknya|menurut)|gimana (kalau|cara|sebaiknya)|kenapa|mengapa|evaluasi|kritik|kritisi|ide\b|layak|ekspansi|fundraising|investor baru|bahas|board|mentor|catat keputusan|konfirmasi d-\d)/i;
const PERINTAH_ATAU_DATA = /(^\s*(berapa|cek|lihat|daftar|kirim|tampilkan|menu|bantuan|help)\b)|\bpdf\b|^\s*(lunas|setujui|tolak|l2\b|refund\b|lapkeu|bayar\b)/i;

export function isAdviceQuestion(question: string): boolean {
  const q = question.trim();
  if (q.length < 8 || PERINTAH_ATAU_DATA.test(q)) return false;
  return SINYAL_DISKUSI.test(q);
}

export function isAdvisorMessage(question: string): boolean {
  return AWALAN_ADVISOR.test(question) || isAdviceQuestion(question);
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
