import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca pesan WhatsApp dari Kepala Cabang proyek konstruksi (Loonars Coffee, Yogyakarta) untuk memahami apakah pesan itu berisi pengajuan operasional: belanja material, pembayaran kontraktor/tukang borongan, atau biaya lain. Jangan mengarang nominal, item, atau kategori yang tidak jelas dari pesannya. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export type CostRequestType = "material_purchase" | "contractor_payment" | "other_expense";

export interface CostRequestItem {
  nama: string;
  nilai: number;
}

export interface CostRequestRecognition {
  /** false when the message isn't a purchase/payment/expense request at all (e.g. a progress report, a question, small talk). */
  isRequest: boolean;
  requestType: CostRequestType | null;
  items: CostRequestItem[];
  /** Total nominal -- explicit total if stated, otherwise sum of items. Null when unclear. */
  nominal: number | null;
  /** For contractor_payment: the week number mentioned ("minggu 1", "minggu ke-2"), if any. */
  weekNumber: number | null;
  /** Party name -- store/supplier for material, contractor name for labor. */
  partyName: string | null;
  notes: string;
}

function parseItems(value: unknown): CostRequestItem[] {
  if (!Array.isArray(value)) return [];
  const items: CostRequestItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const nama = (raw as Record<string, unknown>).nama;
    const nilai = (raw as Record<string, unknown>).nilai;
    if (typeof nama === "string" && nama.trim() && typeof nilai === "number" && Number.isFinite(nilai) && nilai > 0) {
      items.push({ nama: nama.trim().slice(0, 200), nilai });
    }
  }
  return items;
}

function parseRequestType(value: unknown): CostRequestType | null {
  return value === "material_purchase" || value === "contractor_payment" || value === "other_expense" ? value : null;
}

function parseRecognition(text: string): CostRequestRecognition {
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

  const items = parseItems(parsed.items);
  const explicitNominal = typeof parsed.nominal === "number" && Number.isFinite(parsed.nominal) && parsed.nominal > 0 ? parsed.nominal : null;
  const summedNominal = items.length > 0 ? items.reduce((sum, it) => sum + it.nilai, 0) : null;

  return {
    isRequest: parsed.isRequest === true,
    requestType: parseRequestType(parsed.requestType),
    items,
    nominal: explicitNominal ?? summedNominal,
    weekNumber: typeof parsed.weekNumber === "number" && Number.isFinite(parsed.weekNumber) && parsed.weekNumber > 0 ? Math.round(parsed.weekNumber) : null,
    partyName: typeof parsed.partyName === "string" && parsed.partyName.trim() ? parsed.partyName.trim().slice(0, 150) : null,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 300) : "",
  };
}

/**
 * Reads a free-text WhatsApp message from the Kepala Cabang running Loonars
 * Coffee to see if it's a purchase/payment/expense request -- "Belanja
 * Loonars 5 sak semen 2 pickup pasir total 1.850.000", "Bayar kontraktor
 * minggu 1 Rp7.500.000", "Belanja baut 350rb". Extracts every item with its
 * own value where he broke it down, the type of request, and (for
 * contractor payments) which week. Never guesses requestType if the
 * message is genuinely ambiguous -- caller must ask, not silently post a
 * financial transaction.
 */
export async function recognizeConstructionCostRequest(message: string): Promise<CostRequestRecognition> {
  const userPrompt = `Ini pesan WhatsApp dari Kepala Cabang proyek konstruksi "Loonars Coffee":

"""
${message}
"""

Baca dan tentukan:
- isRequest: true kalau pesan ini JELAS berisi pengajuan belanja material, pembayaran kontraktor/tukang, atau biaya lain dengan nilai disebutkan. false kalau ini laporan progress, pertanyaan, atau obrolan biasa tanpa nilai uang.
- requestType: "material_purchase" (beli material/bahan bangunan), "contractor_payment" (bayar kontraktor/tukang/borongan), atau "other_expense" (biaya lain yang bukan keduanya). null kalau tidak jelas jenisnya.
- items: daftar barang/kebutuhan dengan nilainya masing-masing (nama, nilai angka murni), array kosong kalau cuma ada satu nominal total.
- nominal: total nominal yang disebutkan eksplisit, atau null kalau tidak ada dan tidak bisa dijumlahkan dari items.
- weekNumber: nomor minggu yang disebutkan untuk pembayaran kontraktor ("minggu 1", "minggu ke-2"), null kalau tidak disebutkan atau bukan contractor_payment.
- partyName: nama toko/supplier (material_purchase) atau nama kontraktor/tukang (contractor_payment), null kalau tidak disebutkan.
- notes: catatan singkat kalau ada yang tidak jelas.

Balas HANYA dengan JSON object:
{"isRequest": true, "requestType": null, "items": [{"nama": "...", "nilai": 0}], "nominal": 0, "weekNumber": null, "partyName": null, "notes": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 512,
  });
  return parseRecognition(response.text);
}
