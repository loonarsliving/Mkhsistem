import "server-only";

import { generateAIText } from "@/lib/ai/service";
import type { RecognizedTransferRow } from "@/lib/salary/payslip-format";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca foto/screenshot bukti transfer bank untuk mencatat pembayaran gaji karyawan. Satu gambar bisa berisi SATU transfer atau DAFTAR banyak transfer sekaligus (mis. halaman 'task completed' / bulk transfer di internet banking bisnis seperti Kopra Mandiri, KlikBCA Bisnis, BNIDirect). Baca HANYA yang benar-benar terlihat -- jangan mengarang nama, nomor rekening, atau angka. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface TransferListRecognition {
  readable: boolean;
  rows: RecognizedTransferRow[];
}

const MAX_ROWS = 60;

export function parseTransferListRecognition(text: string): TransferListRecognition {
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
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const rawRows = Array.isArray(parsed.transfers) ? parsed.transfers : [];
  const rows: RecognizedTransferRow[] = [];
  for (const raw of rawRows.slice(0, MAX_ROWS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    // A row the bank shows as failed never pays anyone -- drop it here so it can't mark a salary paid.
    if (r.status === "gagal") continue;
    const nominal = typeof r.nominal === "number" && Number.isFinite(r.nominal) && r.nominal > 0 ? r.nominal : null;
    rows.push({ namaPenerima: str(r.namaPenerima, 120), bank: str(r.bank, 60), rekening: str(r.rekening, 60), nominal });
  }
  return { readable: parsed.readable === true, rows };
}

/**
 * Reads every transfer line (recipient name, bank, account number, amount)
 * from a bank screenshot -- a single m-banking receipt yields one row, a
 * bulk-payroll "task completed" list yields one row per employee. Same
 * Gemini Vision mechanism as recognizeTransferProof
 * (transfer-proof-recognition.ts), which only ever reads one nominal.
 */
export async function recognizeTransferList(input: { imageBase64: string; imageMimeType: string }): Promise<TransferListRecognition> {
  const userPrompt = `Ini adalah foto/screenshot bukti transfer bank yang dikirim pemilik perusahaan setelah membayar gaji karyawan.

Baca SETIAP baris transfer yang terlihat di gambar (bisa 1 atau banyak). Untuk tiap baris:
- namaPenerima: nama pemilik rekening PENERIMA persis seperti tertulis (null kalau tidak terbaca)
- bank: nama bank penerima (mis. "BCA", "Mandiri", "BNI", "BRI") (null kalau tidak terbaca)
- rekening: nomor rekening PENERIMA, hanya digit seperti tertulis. JANGAN ambil rekening "Sumber Dana"/"Source of Funds"/pengirim. null kalau tidak terbaca jelas -- lebih baik null daripada menebak satu digit
- nominal: jumlah uang yang ditransfer ke penerima itu sebagai angka murni (mis. "IDR 2,000,000.00" -> 2000000). null kalau tidak terbaca
- status: "berhasil" kalau baris itu jelas sukses (centang hijau / Success / Berhasil, atau halaman menyatakan seluruh task berhasil), "gagal" kalau jelas gagal/ditolak, "tidak_jelas" kalau tidak bisa dipastikan

Kalau sebuah baris terpotong di tepi gambar sehingga nomor rekening atau nominalnya tidak terlihat utuh, isi field yang tidak terlihat dengan null.

readable: true kalau gambar ini memang bukti transfer bank yang bisa dibaca, false kalau bukan.

Balas HANYA dengan JSON object:
{"readable": true, "transfers": [{"namaPenerima": "...", "bank": "...", "rekening": "...", "nominal": 0, "status": "berhasil"}]}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.imageMimeType },
    responseFormat: "json",
    maxOutputTokens: 4096,
  });
  return parseTransferListRecognition(response.text);
}
