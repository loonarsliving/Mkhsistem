import "server-only";

import { generateAIText } from "@/lib/ai/service";

/**
 * Villa Revenue Engine "high season" market research (owner request
 * 2026-09-04; see app/api/villa/ai/competitor-pricing and
 * loonarsliving/villa's src/lib/aiBridge.ts +
 * src/app/api/admin/competitor-rates/research). Uses Gemini's Google
 * Search grounding (useWebSearch) to look at PUBLIC, non-confidential
 * pricing info (listing pages, official sites) for hotels/villas near
 * the given location -- never scrapes a specific platform's private data,
 * only what's already publicly indexed.
 *
 * Same discipline as markom.ts's discoverPropertyCompetitors /
 * researchAndGenerateChecklist: the model may only report competitors
 * it actually found via search, explicitly forbidden from inventing a
 * name or price. Output here is reference data an admin reviews on
 * villa's dashboard (villa_competitor_rates, source='ai_research') --
 * it never sets a live price itself; villa's deterministic rule engine
 * decides whether/how to use it.
 */

export interface VillaCompetitorResearchInput {
  location_label: string;
  room_type_name: string;
  room_type_description: string;
}

export interface VillaCompetitorResult {
  competitor_name: string;
  competitor_type: "hotel" | "villa" | "other";
  price: number;
  source_note: string;
}

interface RawCompetitorResult {
  competitor_name?: unknown;
  competitor_type?: unknown;
  price_idr?: unknown;
  source_note?: unknown;
}

function parseCompetitorResultsJson(text: string): VillaCompetitorResult[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of competitor results");
  return (parsed as RawCompetitorResult[])
    .filter((item): item is RawCompetitorResult => typeof item?.competitor_name === "string" && typeof item?.price_idr === "number" && item.price_idr > 0)
    .map((item) => ({
      competitor_name: String(item.competitor_name).trim().slice(0, 200),
      competitor_type: (item.competitor_type === "hotel" || item.competitor_type === "villa" ? item.competitor_type : "other") as "hotel" | "villa" | "other",
      price: Math.round(Number(item.price_idr)),
      source_note: typeof item.source_note === "string" ? item.source_note.trim().slice(0, 500) : "",
    }))
    .slice(0, 8);
}

export async function researchVillaCompetitorRates(input: VillaCompetitorResearchInput): Promise<VillaCompetitorResult[]> {
  const systemPrompt =
    "Kamu asisten riset harga akomodasi. Tugasmu HANYA melaporkan harga per malam hotel/villa NYATA di sekitar lokasi yang diberikan, berdasarkan hasil pencarian Google publik (situs resmi, OTA/booking listing publik, atau halaman info umum) -- JANGAN PERNAH mengarang nama atau harga. Kalau kamu tidak yakin suatu tempat benar-benar ada atau tidak menemukan info harga publiknya, jangan masukkan ke daftar sama sekali. Ini data referensi untuk admin manusia yang akan mereview manual sebelum dipakai, bukan keputusan otomatis.";

  const userPrompt = `Riset lewat Google Search: cari 3-8 hotel/villa NYATA yang beroperasi di sekitar lokasi "${input.location_label}", lalu laporkan harga per malam publik mereka (dalam Rupiah) untuk kamar/unit yang paling sebanding dengan unit kami berikut:
- Tipe unit kami: ${input.room_type_name}
- Deskripsi: ${input.room_type_description || "-"}

Balas HANYA dengan JSON array (tanpa markdown code fence, tanpa penjelasan tambahan), tiap object:
[{"competitor_name": "nama hotel/villa", "competitor_type": "hotel atau villa", "price_idr": harga_per_malam_dalam_rupiah_sebagai_angka, "source_note": "1 kalimat singkat: dari mana info ini, mis. nama situs/OTA dan kapan kira-kira harga itu terlihat"}]

Kalau tidak menemukan data harga publik yang bisa dipercaya sama sekali, balas dengan array kosong: []`;

  const response = await generateAIText({ systemPrompt, userPrompt, useWebSearch: true, maxOutputTokens: 2048, temperature: 0.2 });
  return parseCompetitorResultsJson(response.text);
}
