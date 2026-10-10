import "server-only";

import { askAI } from "@/lib/ai/service";

/**
 * Villa receptionist chat: AI DRAFT replies (owner request 2026-10-05).
 *
 * The model proposes ONE reply to a guest's WhatsApp, plus a category that
 * says who should actually handle it. Phase 1 is draft-only: villa shows the
 * draft in the Front Desk chat screen and a receptionist clicks Send (or
 * edits it) -- nothing here ever reaches a guest by itself.
 *
 * Guardrails (owner: "agar tidak ada kesalahan membalas pesan"):
 * - Facts come ONLY from the knowledge text villa sends (owner-approved) and
 *   from the availability data villa fetched from its own booking system.
 *   The model is told to hand off rather than guess.
 * - Room prices are never the model's: they only exist in `ketersediaan`,
 *   computed by villa-api exactly as for loonars.id. Villa additionally
 *   rejects any draft whose numbers don't appear in those inputs
 *   (src/lib/aiResepsionis.ts, angkaTidakDikenal) -- this prompt is the
 *   first line of defence, not the only one.
 * - Packages outside the room (grill, honeymoon, decor, food, ...) go to
 *   Rebecca; complaints and on-site requests (gas, broken things, ...) go to
 *   security + Rebecca. Owner decisions 2026-10-05.
 *
 * Called from villa's server through app/api/villa/ai/chat-reply.
 */

export const KATEGORI_BALASAN = [
  /** Answerable from the knowledge text / availability data. */
  "jawab",
  /** Guest asked about specific dates but villa hasn't sent availability yet. */
  "cek_tanggal",
  /** Guest wants to book: draft directs them to loonars.id (QRIS) for now. */
  "booking",
  /** Package / service outside the room -- Rebecca decides. */
  "paket_rebecca",
  /** Complaint or on-site request (gas, broken item, emergency) -- security + Rebecca. */
  "komplain",
  /** Anything else the knowledge text doesn't cover -- a human answers. */
  "perlu_resepsionis",
] as const;

export type KategoriBalasan = (typeof KATEGORI_BALASAN)[number];

export interface PesanRiwayat {
  arah: "masuk" | "keluar";
  isi: string;
  /** "2026-10-05 14:03" WIB, for the model's sense of order/time only. */
  waktu?: string;
}

export interface KetersediaanTipe {
  nama: string;
  tersedia: number;
  malam: number;
  harga_per_malam: number | null;
  harga_total: number | null;
}

export interface ChatReplyInput {
  pengetahuan: string;
  riwayat: PesanRiwayat[];
  nama_tamu?: string | null;
  /** "prospek" | "menginap" | "selesai", plus booking context in words if any. */
  konteks_tamu?: string | null;
  /** Current WIB time, "2026-10-05 14:03 (Minggu)". */
  sekarang: string;
  ketersediaan?: { checkin: string; checkout: string; tipe: KetersediaanTipe[] } | null;
}

export interface ChatReplyDraft {
  kategori: KategoriBalasan;
  draf: string;
  /** Only with kategori "cek_tanggal". */
  cek_tanggal: { checkin: string; checkout: string } | null;
  alasan: string;
}

export const MAX_RIWAYAT = 30;
export const MAX_PENGETAHUAN_CHARS = 12_000;

const SYSTEM_PROMPT = `Kamu menyusun DRAF balasan WhatsApp untuk resepsionis Loonars Private Living Villa Yogyakarta. Draf dibaca resepsionis dulu sebelum dikirim ke tamu.

ATURAN MUTLAK:
1. Gunakan HANYA fakta dari bagian PENGETAHUAN dan DATA KETERSEDIAAN. Jangan menebak, jangan menambah fakta, jangan berjanji di luar itu. Kalau jawabannya tidak ada di sana, pilih kategori "perlu_resepsionis" dan tulis draf singkat yang sopan bahwa tim akan mengecek dulu.
2. Harga kamar HANYA boleh disebut kalau ada di DATA KETERSEDIAAN, persis angkanya. Jangan pernah menghitung diskon, total baru, atau harga perkiraan sendiri.
3. Kalau tamu menanyakan ketersediaan/harga untuk tanggal tertentu dan DATA KETERSEDIAAN belum ada (atau tanggalnya berbeda), pilih kategori "cek_tanggal" dan isi "cek_tanggal" dengan tanggal check-in dan check-out format YYYY-MM-DD (kalau tamu menyebut satu malam saja, check-out = hari berikutnya; kalau tahun tidak disebut, pakai tanggal terdekat yang belum lewat). Kalau tanggalnya tidak jelas, tanyakan tanggalnya (kategori "jawab").
4. Paket atau layanan di luar kamar (BBQ/grill, honeymoon, babymoon, birthday, dekorasi, floating breakfast, sarapan, makanan/minuman, sewa motor, dan sejenisnya): kategori "paket_rebecca". Jangan sebut harga atau isi paket. Draf: terima kasih, kami tanyakan dulu ke tim terkait dan segera kami kabari.
5. Komplain, sesuatu rusak/tidak berfungsi, minta gas/galon/handuk/perlengkapan ke kamar, keadaan darurat, atau tamu kecewa: kategori "komplain". Draf: mohon maaf, sudah kami teruskan ke tim kami yang akan segera membantu. Jangan menyalahkan tamu, jangan menjanjikan kompensasi/refund.
6. Tamu ingin memesan/booking kamar: kategori "booking". Arahkan ke loonars.id (pembayaran QRIS). Kalau ada DATA KETERSEDIAAN yang relevan, boleh sebut harganya.
7. Jangan pernah menjanjikan diskon, refund, kompensasi, harga khusus, atau pengecualian aturan.
8. Gaya: bahasa Indonesia sopan dan hangat seperti resepsionis hotel, panggil tamu "Kak", singkat (1-4 kalimat), boleh emoji ☺️🙏 secukupnya. Kalau tamu menulis dalam bahasa lain, tetap tulis draf dalam bahasa Indonesia (sistem yang menerjemahkan).
9. Balas pesan TERAKHIR tamu yang belum dijawab, dengan memperhatikan riwayat.

Balas HANYA dengan objek JSON:
{"kategori": "jawab|cek_tanggal|booking|paket_rebecca|komplain|perlu_resepsionis", "draf": "<teks balasan>", "cek_tanggal": {"checkin": "YYYY-MM-DD", "checkout": "YYYY-MM-DD"} atau null, "alasan": "<satu kalimat: dari mana jawaban ini / kenapa kategori ini>"}`;

function rupiah(n: number | null): string {
  return n === null ? "-" : `Rp${Math.round(n).toLocaleString("id-ID")}`;
}

export function buildUserPrompt(input: ChatReplyInput): string {
  const riwayat = input.riwayat
    .slice(-MAX_RIWAYAT)
    .map((m) => `[${m.waktu ?? ""}] ${m.arah === "masuk" ? "TAMU" : "VILLA"}: ${m.isi}`)
    .join("\n");

  let ketersediaan = "(belum ada)";
  if (input.ketersediaan) {
    const k = input.ketersediaan;
    const baris = k.tipe.map((t) =>
      t.tersedia > 0
        ? `- ${t.nama}: TERSEDIA (${t.tersedia} unit), ${t.malam} malam, rata-rata ${rupiah(t.harga_per_malam)}/malam, total ${rupiah(t.harga_total)}`
        : `- ${t.nama}: PENUH`,
    );
    ketersediaan = `Check-in ${k.checkin}, check-out ${k.checkout}:\n${baris.join("\n") || "- (tidak ada data)"}`;
  }

  return [
    `WAKTU SEKARANG (WIB): ${input.sekarang}`,
    `NAMA TAMU: ${input.nama_tamu?.trim() || "(tidak diketahui)"}`,
    `STATUS TAMU: ${input.konteks_tamu?.trim() || "calon tamu, belum ada booking"}`,
    "",
    "PENGETAHUAN:",
    input.pengetahuan.slice(0, MAX_PENGETAHUAN_CHARS),
    "",
    "DATA KETERSEDIAAN:",
    ketersediaan,
    "",
    "RIWAYAT PERCAKAPAN (lama ke baru):",
    riwayat,
  ].join("\n");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses and validates the model's reply; throws on anything unusable. */
export function parseChatReply(raw: string): ChatReplyDraft {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const kategori = parsed.kategori;
  if (typeof kategori !== "string" || !(KATEGORI_BALASAN as readonly string[]).includes(kategori)) {
    throw new Error(`chat reply has an unknown kategori: ${String(kategori)}`);
  }
  const draf = typeof parsed.draf === "string" ? parsed.draf.trim() : "";
  if (!draf) throw new Error("chat reply has no draf text");
  const alasan = typeof parsed.alasan === "string" ? parsed.alasan.trim() : "";

  let cekTanggal: ChatReplyDraft["cek_tanggal"] = null;
  if (kategori === "cek_tanggal") {
    const c = parsed.cek_tanggal as { checkin?: unknown; checkout?: unknown } | null | undefined;
    const checkin = typeof c?.checkin === "string" ? c.checkin.trim() : "";
    const checkout = typeof c?.checkout === "string" ? c.checkout.trim() : "";
    if (!ISO_DATE.test(checkin) || !ISO_DATE.test(checkout) || checkout <= checkin) {
      throw new Error("chat reply asked for a date check without a valid date range");
    }
    cekTanggal = { checkin, checkout };
  }

  return { kategori: kategori as KategoriBalasan, draf, cek_tanggal: cekTanggal, alasan };
}

export async function draftChatReply(input: ChatReplyInput): Promise<ChatReplyDraft> {
  const raw = await askAI(SYSTEM_PROMPT, buildUserPrompt(input), { temperature: 0.2, maxOutputTokens: 1024 });
  return parseChatReply(raw);
}
