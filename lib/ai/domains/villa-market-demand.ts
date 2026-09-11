import "server-only";

import { generateAIText } from "@/lib/ai/service";

/**
 * Villa Revenue Engine market-demand research (owner request 2026-09-11,
 * follow-up to villa-competitor-pricing.ts). Separate from that file
 * because it answers a different question at a different cadence:
 * competitor prices are researched per room type, this is researched
 * once per location and changes far more slowly (an event calendar
 * doesn't shift day to day), so it gets its own staleness window on
 * villa's side rather than sharing one AI-call budget per pricing run.
 *
 * Two things, both via Gemini's Google Search grounding on PUBLIC,
 * non-confidential sources -- same "never invent, only report what
 * search actually found" discipline as the competitor-pricing domain:
 *  1. A qualitative read on current search/booking interest for
 *     villa/homestay rentals in the area (naik/turun/stabil + why) --
 *     explicitly NOT Google Analytics (no GA4 property exists for this
 *     to read), just what a web search of recent travel/booking
 *     coverage suggests about demand direction. Owner confirmed this
 *     interpretation via AskUserQuestion before this was built.
 *  2. Real upcoming events/festivals/public holidays near the location
 *     that plausibly move accommodation demand, each with an admin-
 *     reviewable expected-impact rating.
 *
 * Output lands in villa_high_season_periods (created_by =
 * 'ai_jogja_events_research') -- the SAME table and column villa's rule
 * engine already reads for its high-season floor, tagged so it's
 * distinguishable from a manually-entered period, never a new table.
 */

export interface MarketDemandInput {
  location_label: string;
}

export type DemandTrend = "naik" | "turun" | "stabil";

export interface MarketDemandEvent {
  label: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  expected_impact: "low" | "medium" | "high";
  source_note: string;
}

export interface MarketDemandResult {
  demand_trend: DemandTrend;
  trend_note: string;
  events: MarketDemandEvent[];
}

interface RawEvent {
  label?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  expected_impact?: unknown;
  source_note?: unknown;
}
interface RawResult {
  demand_trend?: unknown;
  trend_note?: unknown;
  events?: unknown;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseMarketDemandJson(text: string): MarketDemandResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as RawResult;

  const demand_trend: DemandTrend = parsed.demand_trend === "naik" || parsed.demand_trend === "turun" ? parsed.demand_trend : "stabil";
  const trend_note = typeof parsed.trend_note === "string" ? parsed.trend_note.trim().slice(0, 500) : "";

  const rawEvents = Array.isArray(parsed.events) ? (parsed.events as RawEvent[]) : [];
  const events: MarketDemandEvent[] = rawEvents
    .filter(
      (e): e is Required<Pick<RawEvent, "label" | "start_date" | "end_date">> & RawEvent =>
        typeof e?.label === "string" && typeof e?.start_date === "string" && DATE_RE.test(e.start_date) && typeof e?.end_date === "string" && DATE_RE.test(e.end_date) && e.end_date >= e.start_date,
    )
    .map((e) => ({
      label: String(e.label).trim().slice(0, 200),
      start_date: e.start_date as string,
      end_date: e.end_date as string,
      expected_impact: (e.expected_impact === "medium" || e.expected_impact === "high" ? e.expected_impact : "low") as "low" | "medium" | "high",
      source_note: typeof e.source_note === "string" ? e.source_note.trim().slice(0, 500) : "",
    }))
    .slice(0, 15);

  return { demand_trend, trend_note, events };
}

export async function researchVillaMarketDemand(input: MarketDemandInput): Promise<MarketDemandResult> {
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt =
    "Kamu asisten riset permintaan pasar akomodasi. Kamu HANYA boleh melaporkan event/festival/hari libur NYATA yang benar-benar akan berlangsung, berdasarkan hasil pencarian Google publik -- JANGAN PERNAH mengarang nama acara atau tanggal. Kalau tidak yakin suatu acara benar-benar akan terjadi pada tanggal tertentu, jangan masukkan ke daftar. Ini data referensi untuk mesin harga otomatis yang tetap dijaga batas atas/bawahnya oleh sistem, bukan keputusan harga final itu sendiri.";

  const userPrompt = `Hari ini tanggal ${today}. Riset lewat Google Search untuk area "${input.location_label}":

1. TREN PERMINTAAN: dari berita/artikel travel terkini, apakah minat sewa villa/homestay di area ini sedang naik, turun, atau stabil? (Bukan data Google Analytics situs manapun -- murni dari apa yang kamu temukan lewat pencarian publik.)

2. EVENT MENDATANG: cari 0-15 event/festival/hari libur NYATA yang akan berlangsung di area ini atau kota terdekat dalam 60 hari ke depan (dari ${today}), yang masuk akal akan meningkatkan permintaan penginapan (festival budaya, konser besar, libur panjang nasional, wisuda massal, dll -- bukan acara kecil/lokal yang tidak menarik wisatawan menginap).

Balas HANYA dengan JSON (tanpa markdown code fence, tanpa penjelasan tambahan):
{"demand_trend": "naik" atau "turun" atau "stabil", "trend_note": "1-2 kalimat alasan singkat", "events": [{"label": "nama event", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "expected_impact": "low" atau "medium" atau "high", "source_note": "1 kalimat: sumber info ini"}]}

Kalau tidak menemukan event yang meyakinkan, balas array events kosong: []`;

  const response = await generateAIText({ systemPrompt, userPrompt, useWebSearch: true, maxOutputTokens: 2048, temperature: 0.2 });
  return parseMarketDemandJson(response.text);
}
