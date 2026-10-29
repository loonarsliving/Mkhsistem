import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca foto, screenshot, atau PDF mutasi rekening bank perusahaan untuk membantu bagian keuangan mencocokkan dana masuk. Salin HANYA apa yang benar-benar tertulis di dokumen -- jangan mengarang baris, tanggal, keterangan, atau nominal, dan jangan menjumlahkan atau membulatkan angka. Kalau dokumen tidak terbaca atau bukan mutasi rekening, katakan begitu. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface MutasiBaris {
  /** YYYY-MM-DD */
  tanggal: string;
  keterangan: string;
  /** Rupiah, bilangan bulat positif. */
  nominal: number;
  arah: "masuk" | "keluar";
}

export interface MutasiBankHasil {
  readable: boolean;
  bank: string | null;
  rows: MutasiBaris[];
  catatan: string;
}

const MAKS_BARIS = 300;

function parseBaris(value: unknown): MutasiBaris[] {
  if (!Array.isArray(value)) return [];
  const rows: MutasiBaris[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const tanggal = typeof r.tanggal === "string" ? r.tanggal.trim() : "";
    const nominal = typeof r.nominal === "number" ? r.nominal : Number(r.nominal);
    const arah = r.arah === "masuk" || r.arah === "keluar" ? r.arah : null;
    // Baris yang tanggal/nominal/arahnya tidak jelas dibuang, bukan ditebak:
    // angka yang salah baca lebih berbahaya daripada baris yang hilang,
    // karena baris yang hilang masih terlihat oleh finance di dokumen aslinya.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || !arah || !Number.isFinite(nominal) || nominal <= 0) continue;
    rows.push({
      tanggal,
      keterangan: typeof r.keterangan === "string" ? r.keterangan.replace(/\s+/g, " ").trim().slice(0, 300) : "",
      nominal: Math.round(nominal),
      arah,
    });
    if (rows.length >= MAKS_BARIS) break;
  }
  return rows;
}

export function parseMutasiReply(text: string): MutasiBankHasil {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI bukan JSON yang valid");
  }

  return {
    readable: parsed.readable === true,
    bank: typeof parsed.bank === "string" && parsed.bank.trim() ? parsed.bank.trim().slice(0, 60) : null,
    rows: parseBaris(parsed.rows),
    catatan: typeof parsed.catatan === "string" ? parsed.catatan.trim().slice(0, 300) : "",
  };
}

/**
 * Villa's Checklist Dana Masuk bridge (see app/api/villa/ai/bank-statement).
 * Reads one bank-statement photo/screenshot/PDF and transcribes its rows --
 * date, description, amount, credit/debit. Transcription only: matching a
 * transfer to OTA payouts and recording anything as received stays in
 * villa's own code and is confirmed by a finance user, so the model never
 * decides what counts as paid.
 */
export async function bacaMutasiBank(input: { data: string; mimeType: string; hariIni: string }): Promise<MutasiBankHasil> {
  const userPrompt = `Ini adalah mutasi rekening bank (foto, screenshot aplikasi bank, atau PDF rekening koran). Hari ini ${input.hariIni}.

Salin SETIAP baris transaksi yang terlihat:
- tanggal: tanggal transaksi, format YYYY-MM-DD. Kalau tahun tidak tertulis, pakai tahun yang paling masuk akal dari hari ini (bukan tanggal di masa depan).
- keterangan: teks keterangan/uraian/nama pengirim persis seperti tertulis (gabungkan kalau terpecah beberapa baris).
- nominal: jumlah transaksi dalam rupiah sebagai angka bulat tanpa titik/koma pemisah ribuan (mis. "8.954.169,00" -> 8954169). Jangan pakai kolom saldo.
- arah: "masuk" untuk kredit/CR/uang masuk/tanda +, "keluar" untuk debit/DB/uang keluar/tanda -.

Lewati baris saldo awal, saldo akhir, dan total. Jangan menebak baris yang terpotong atau tidak terbaca -- sebutkan saja di catatan.

Balas HANYA dengan JSON object:
{"readable": true, "bank": "Mandiri", "rows": [{"tanggal": "2026-10-29", "keterangan": "...", "nominal": 8954169, "arah": "masuk"}], "catatan": ""}

Kalau ini bukan mutasi rekening atau tidak terbaca: {"readable": false, "bank": null, "rows": [], "catatan": "alasannya"}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.data, mimeType: input.mimeType },
    responseFormat: "json",
    temperature: 0,
    maxOutputTokens: 8192,
  });
  return parseMutasiReply(response.text);
}
