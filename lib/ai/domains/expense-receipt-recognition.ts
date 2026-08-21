import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca foto nota/struk belanja (pembelian bahan bangunan atau operasional) untuk membantu mencatat pengeluaran perusahaan. Baca HANYA apa yang benar-benar terlihat di gambar -- jangan mengarang angka atau nama barang. Kalau gambar tidak terbaca jelas atau bukan nota/struk belanja, katakan begitu. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface ExpenseReceiptRecognition {
  readable: boolean;
  item: string | null;
  nominal: number | null;
  tanggal: string | null;
  supplier: string | null;
  notes: string;
}

function parseRecognition(text: string): ExpenseReceiptRecognition {
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
    item: typeof parsed.item === "string" && parsed.item.trim() ? parsed.item.trim().slice(0, 300) : null,
    nominal: typeof parsed.nominal === "number" && Number.isFinite(parsed.nominal) && parsed.nominal > 0 ? parsed.nominal : null,
    tanggal: typeof parsed.tanggal === "string" && parsed.tanggal.trim() ? parsed.tanggal.trim().slice(0, 40) : null,
    supplier: typeof parsed.supplier === "string" && parsed.supplier.trim() ? parsed.supplier.trim().slice(0, 150) : null,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 300) : "",
  };
}

/**
 * Reads a belanja/nota (purchase receipt) photo sent on WhatsApp by Endy or
 * Rebecca -- extracts what was bought and the total so it can become a
 * pengajuan straight away, no manual web form needed. Real Gemini Vision
 * call, same mechanism as recognizeTransferProof
 * (transfer-proof-recognition.ts). The image itself is never persisted --
 * this function only reads it once, in memory.
 */
export async function recognizeExpenseReceipt(input: { imageBase64: string; imageMimeType: string }): Promise<ExpenseReceiptRecognition> {
  const userPrompt = `Ini adalah foto nota/struk belanja untuk sebuah pembelian perusahaan (bahan bangunan atau operasional).

Lihat langsung isi gambar ini dan baca:
- readable: true kalau ini benar-benar terlihat seperti nota/struk belanja yang cukup jelas dibaca, false kalau tidak
- item: ringkasan barang yang dibeli (gabungkan semua baris item jadi satu deskripsi singkat), null kalau tidak terbaca
- nominal: TOTAL yang harus dibayar, sebagai angka murni tanpa "Rp" atau titik/koma (null kalau tidak terbaca)
- tanggal: tanggal transaksi seperti tertulis di nota (null kalau tidak terbaca)
- supplier: nama toko/supplier seperti tertulis di nota (null kalau tidak terbaca)
- notes: catatan singkat 1 kalimat, misalnya kalau totalnya tidak terlihat jelas atau nota terpotong

Balas HANYA dengan JSON object:
{"readable": true, "item": "...", "nominal": 0, "tanggal": null, "supplier": null, "notes": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.imageMimeType },
    responseFormat: "json",
    maxOutputTokens: 512,
  });
  return parseRecognition(response.text);
}
