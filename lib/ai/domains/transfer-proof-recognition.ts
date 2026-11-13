import "server-only";

import { createHash } from "node:crypto";

import { AI_CONFIG } from "@/lib/ai/config";
import { generateAIText } from "@/lib/ai/service";
import { logger } from "@/lib/logger";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca foto/screenshot bukti transfer bank (dari aplikasi m-banking atau struk ATM) untuk membantu mencatat pengeluaran perusahaan. Baca HANYA apa yang benar-benar terlihat di gambar -- jangan mengarang angka. Kalau gambar tidak terbaca jelas atau bukan bukti transfer, katakan begitu. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface TransferProofRecognition {
  readable: boolean;
  nominal: number | null;
  tanggal: string | null;
  rekeningTujuan: string | null;
  /** Jam transaksi "HH:MM" seperti tertulis di bukti (null kalau tidak ada/terbaca). */
  waktu?: string | null;
  /** Nomor referensi / ID transaksi bila tertulis (null kalau tidak ada/terbaca). */
  referensi?: string | null;
  notes: string;
}

function parseRecognition(text: string): TransferProofRecognition {
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
    nominal: typeof parsed.nominal === "number" && Number.isFinite(parsed.nominal) ? parsed.nominal : null,
    tanggal: typeof parsed.tanggal === "string" && parsed.tanggal.trim() ? parsed.tanggal.trim().slice(0, 40) : null,
    rekeningTujuan: typeof parsed.rekeningTujuan === "string" && parsed.rekeningTujuan.trim() ? parsed.rekeningTujuan.trim().slice(0, 150) : null,
    waktu: typeof parsed.waktu === "string" && /^([01]?\d|2[0-3])[:.][0-5]\d/.test(parsed.waktu.trim()) ? parsed.waktu.trim().slice(0, 5).replace(".", ":") : null,
    referensi: typeof parsed.referensi === "string" && parsed.referensi.trim() ? parsed.referensi.trim().slice(0, 60) : null,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 300) : "",
  };
}

/**
 * Reads a bank-transfer proof photo (Super Admin's WhatsApp reply to a
 * finance_expense_alert notification) -- extracts the transferred amount,
 * date, and destination account so it can be compared against the
 * pengajuan's requested nominal before jurnal posts. Real Gemini Vision
 * call, same mechanism as assessConstructionProgress
 * (construction-progress-vision.ts).
 */
export async function recognizeTransferProof(input: { imageBase64: string; imageMimeType: string; expectedNominal?: number }): Promise<TransferProofRecognition> {
  // One WhatsApp photo walks through several matchers in a row (fee,
  // settlement, gaji, pengajuan ...) and each of them asks for this same
  // reading -- share one in-flight/finished result per photo instead of
  // paying for the stronger model five times over. Failures are never kept.
  if (typeof input.expectedNominal === "number") return readTransferProof(input);
  const key = createHash("sha256").update(input.imageBase64).digest("hex");
  const now = Date.now();
  for (const [k, v] of recentReads) if (now - v.at > RECENT_READ_TTL_MS) recentReads.delete(k);
  const cached = recentReads.get(key);
  if (cached) return cached.result;
  const result = readTransferProof(input);
  recentReads.set(key, { at: now, result });
  result.catch(() => recentReads.delete(key));
  return result;
}

const RECENT_READ_TTL_MS = 2 * 60 * 1000;
const recentReads = new Map<string, { at: number; result: Promise<TransferProofRecognition> }>();

async function readTransferProof(input: { imageBase64: string; imageMimeType: string; expectedNominal?: number }): Promise<TransferProofRecognition> {
  const expectedLine =
    typeof input.expectedNominal === "number"
      ? `Nominal yang seharusnya ditransfer: Rp${Math.round(input.expectedNominal).toLocaleString("id-ID")}.`
      : "Nominal yang ditransfer belum diketahui sebelumnya -- baca langsung dari gambar.";
  const userPrompt = `Ini adalah foto/screenshot yang dikirim sebagai bukti transfer bank untuk sebuah pembayaran perusahaan. ${expectedLine}

Lihat langsung isi gambar ini dan baca:
- readable: true kalau ini benar-benar terlihat seperti bukti transfer (screenshot m-banking/struk ATM) yang cukup jelas dibaca, false kalau tidak
- nominal: jumlah uang yang ditransfer, sebagai angka murni tanpa "Rp" atau titik/koma (null kalau tidak terbaca)
- tanggal: tanggal transaksi seperti tertulis di gambar (null kalau tidak terbaca)
- waktu: jam transaksi seperti tertulis di gambar, format "HH:MM" (null kalau tidak terbaca)
- referensi: nomor referensi / ID transaksi / no. transaksi bila tertulis di gambar (null kalau tidak ada)
- rekeningTujuan: nama dan/atau nomor rekening PENERIMA (tujuan transfer -- uang MASUK ke rekening ini), seperti tertulis di gambar. Kalau struk menampilkan dua rekening sekaligus (mis. field "Penerima"/"Tujuan" DAN field "Sumber Dana"/"Dari"/"Rekening Anda"), ambil HANYA yang berlabel Penerima/Tujuan -- JANGAN ambil rekening sumber dana/pengirim. null kalau tidak terbaca
- notes: catatan singkat 1 kalimat, termasuk kalau nominal di gambar terlihat berbeda dari nominal yang seharusnya

Balas HANYA dengan JSON object:
{"readable": true, "nominal": 0, "tanggal": null, "waktu": null, "referensi": null, "rekeningTujuan": null, "notes": "..."}`;

  const request = {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.imageMimeType },
    responseFormat: "json" as const,
    maxOutputTokens: 512,
    // Reading digits off a receipt is not a creative task.
    temperature: 0,
  };

  // Stronger model first (AI_CONFIG.geminiTransferProofModel), one attempt
  // only -- if it's overloaded, times out, or returns something that isn't
  // the JSON asked for, the everyday model reads the photo instead with its
  // normal retry budget. Skipped entirely when both are the same model.
  const strongModel = AI_CONFIG.geminiTransferProofModel;
  if (strongModel && strongModel !== AI_CONFIG.geminiModel) {
    try {
      const response = await generateAIText({ ...request, model: strongModel, maxAttempts: 1 });
      return parseRecognition(response.text);
    } catch (err) {
      logger.warn("transfer proof: strong model failed, falling back to default model", {
        strongModel,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const response = await generateAIText(request);
  return parseRecognition(response.text);
}
