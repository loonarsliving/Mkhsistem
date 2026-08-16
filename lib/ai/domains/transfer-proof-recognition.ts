import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca foto/screenshot bukti transfer bank (dari aplikasi m-banking atau struk ATM) untuk membantu mencatat pengeluaran perusahaan. Baca HANYA apa yang benar-benar terlihat di gambar -- jangan mengarang angka. Kalau gambar tidak terbaca jelas atau bukan bukti transfer, katakan begitu. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface TransferProofRecognition {
  readable: boolean;
  nominal: number | null;
  tanggal: string | null;
  rekeningTujuan: string | null;
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
  const expectedLine =
    typeof input.expectedNominal === "number"
      ? `Nominal yang seharusnya ditransfer: Rp${Math.round(input.expectedNominal).toLocaleString("id-ID")}.`
      : "Nominal yang ditransfer belum diketahui sebelumnya -- baca langsung dari gambar.";
  const userPrompt = `Ini adalah foto/screenshot yang dikirim sebagai bukti transfer bank untuk sebuah pembayaran perusahaan. ${expectedLine}

Lihat langsung isi gambar ini dan baca:
- readable: true kalau ini benar-benar terlihat seperti bukti transfer (screenshot m-banking/struk ATM) yang cukup jelas dibaca, false kalau tidak
- nominal: jumlah uang yang ditransfer, sebagai angka murni tanpa "Rp" atau titik/koma (null kalau tidak terbaca)
- tanggal: tanggal transaksi seperti tertulis di gambar (null kalau tidak terbaca)
- rekeningTujuan: nama dan/atau nomor rekening tujuan seperti tertulis di gambar (null kalau tidak terbaca)
- notes: catatan singkat 1 kalimat, termasuk kalau nominal di gambar terlihat berbeda dari nominal yang seharusnya

Balas HANYA dengan JSON object:
{"readable": true, "nominal": 0, "tanggal": null, "rekeningTujuan": null, "notes": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.imageMimeType },
    responseFormat: "json",
    maxOutputTokens: 512,
  });
  return parseRecognition(response.text);
}
