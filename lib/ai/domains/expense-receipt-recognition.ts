import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca foto nota/struk belanja (pembelian bahan bangunan atau operasional) untuk membantu mencatat pengeluaran perusahaan. Baca HANYA apa yang benar-benar terlihat di gambar -- jangan mengarang nama barang atau harga. Kalau gambar tidak terbaca jelas atau bukan nota/struk belanja, katakan begitu. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface ExpenseReceiptItem {
  nama: string;
  harga: number;
}

export interface ExpenseReceiptRecognition {
  readable: boolean;
  items: ExpenseReceiptItem[];
  nominal: number | null;
  tanggal: string | null;
  supplier: string | null;
  notes: string;
}

function parseItems(value: unknown): ExpenseReceiptItem[] {
  if (!Array.isArray(value)) return [];
  const items: ExpenseReceiptItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const nama = (raw as Record<string, unknown>).nama;
    const harga = (raw as Record<string, unknown>).harga;
    if (typeof nama === "string" && nama.trim() && typeof harga === "number" && Number.isFinite(harga) && harga > 0) {
      items.push({ nama: nama.trim().slice(0, 200), harga });
    }
  }
  return items;
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
    items: parseItems(parsed.items),
    nominal: typeof parsed.nominal === "number" && Number.isFinite(parsed.nominal) && parsed.nominal > 0 ? parsed.nominal : null,
    tanggal: typeof parsed.tanggal === "string" && parsed.tanggal.trim() ? parsed.tanggal.trim().slice(0, 40) : null,
    supplier: typeof parsed.supplier === "string" && parsed.supplier.trim() ? parsed.supplier.trim().slice(0, 150) : null,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 300) : "",
  };
}

/**
 * Reads a belanja/nota (purchase receipt) photo sent on WhatsApp by Endy or
 * Rebecca -- extracts EVERY line item with its own price (not one combined
 * summary) plus the printed total, so the resulting pengajuan/report shows
 * the same breakdown a person reading the physical nota would see. Real
 * Gemini Vision call, same mechanism as recognizeTransferProof
 * (transfer-proof-recognition.ts). The image itself is never persisted --
 * this function only reads it once, in memory.
 */
export async function recognizeExpenseReceipt(input: { imageBase64: string; imageMimeType: string }): Promise<ExpenseReceiptRecognition> {
  const userPrompt = `Ini adalah foto nota/struk belanja untuk sebuah pembelian perusahaan (bahan bangunan atau operasional).

Lihat langsung isi gambar ini dan baca:
- readable: true kalau ini benar-benar terlihat seperti nota/struk belanja yang cukup jelas dibaca, false kalau tidak
- items: DAFTAR setiap baris barang yang dibeli, JANGAN digabung jadi satu -- satu entri per baris barang di nota, masing-masing dengan:
  - nama: nama barang seperti tertulis di nota
  - harga: harga baris itu (kalau ada qty x harga satuan, pakai harga TOTAL baris itu, bukan harga satuan), angka murni tanpa "Rp"/titik/koma
  (array kosong kalau tidak ada baris yang terbaca jelas)
- nominal: TOTAL keseluruhan yang harus dibayar seperti tertulis di nota (boleh beda dari jumlah items kalau ada diskon/pajak/ongkir -- ini yang dipakai untuk pencatatan), angka murni (null kalau tidak terbaca)
- tanggal: tanggal transaksi seperti tertulis di nota (null kalau tidak terbaca)
- supplier: nama toko/supplier seperti tertulis di nota (null kalau tidak terbaca)
- notes: catatan singkat 1 kalimat, misalnya kalau nominal total berbeda dari jumlah item atau notanya terpotong

Balas HANYA dengan JSON object:
{"readable": true, "items": [{"nama": "...", "harga": 0}], "nominal": 0, "tanggal": null, "supplier": null, "notes": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.imageMimeType },
    responseFormat: "json",
    maxOutputTokens: 768,
  });
  return parseRecognition(response.text);
}
