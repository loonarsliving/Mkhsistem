import { describe, expect, it } from "vitest";

import { __testables, FridayAnalysisError } from "@/lib/ai/friday/analyst";

const { parseAnalysis } = __testables;

/**
 * The parser is the only thing standing between a bad generation and a
 * database row leadership will read as fact, so it is tested directly rather
 * than through a mocked model call.
 *
 * Two behaviors matter most and are asserted separately below:
 *   - a briefing missing a required section must FAIL (retry, don't publish)
 *   - an invented action key must be DROPPED while the rest survives
 * Getting those backwards in either direction is the expensive bug: a silently
 * incomplete briefing, or a whole day's analysis lost to one bad action.
 */

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    headline: "Biaya akuisisi lead naik 38% sementara closing turun",
    severity: "perhatian",
    situasi: "Spend iklan aktif Rp42 juta menghasilkan 61 lead minggu ini, turun dari 88 minggu lalu.",
    analisa: "Kenaikan biaya per lead terjadi bersamaan dengan 44% prospek aktif tidak di-follow-up 3 hari.",
    risiko: "Kalau dibiarkan dua minggu, sekitar 90 lead berbayar akan dingin, setara Rp38 juta belanja iklan.",
    solusi: [
      { judul: "Hentikan campaign terburuk", ringkasan: "Matikan 2 campaign dengan biaya per chat tertinggi", keuntungan: "Hemat langsung", kerugian: "Volume lead turun", biaya_estimasi: "Tidak ada biaya langsung", dampak: "tinggi" },
      { judul: "Fokus habiskan backlog", ringkasan: "Bekukan lead baru 3 hari, kejar backlog", keuntungan: "Konversi naik", kerugian: "Pipeline menipis", biaya_estimasi: "Tidak ada", dampak: "sedang" },
      { judul: "Tambah kapasitas sales", ringkasan: "Alihkan 2 staff bantu follow-up", keuntungan: "Kapasitas naik cepat", kerugian: "Mengorbankan tugas lain", biaya_estimasi: "Biaya peluang 2 orang", dampak: "sedang" },
    ],
    rekomendasi: "Ambil opsi kedua karena akar masalahnya kapasitas follow-up, bukan volume lead.",
    hasil_diharapkan: "Porsi prospek mangkrak turun di bawah 20% dalam 7 hari.",
    actions: [],
    ...overrides,
  };
}

describe("FRIDAY analysis parser", () => {
  it("parses a well-formed briefing", () => {
    const result = parseAnalysis(JSON.stringify(validPayload()));

    expect(result.severity).toBe("perhatian");
    expect(result.solusi).toHaveLength(3);
    expect(result.notes).toEqual([]);
    expect(result.rekomendasi).toContain("opsi kedua");
  });

  it("tolerates a markdown code fence around the JSON", () => {
    const result = parseAnalysis("```json\n" + JSON.stringify(validPayload()) + "\n```");
    expect(result.situasi).toContain("61 lead");
  });

  it("recovers JSON wrapped in stray prose", () => {
    const result = parseAnalysis(`Berikut analisanya:\n${JSON.stringify(validPayload())}\nSemoga membantu.`);
    expect(result.headline).toContain("Biaya akuisisi lead");
  });

  it("rejects a briefing missing a required section instead of publishing a partial one", () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).risiko;

    expect(() => parseAnalysis(JSON.stringify(payload))).toThrow(FridayAnalysisError);
  });

  it("rejects output that is not JSON at all", () => {
    expect(() => parseAnalysis("Maaf, saya tidak bisa menganalisa data ini.")).toThrow(FridayAnalysisError);
  });

  it("drops an invented action key but keeps the analysis", () => {
    const result = parseAnalysis(
      JSON.stringify(
        validPayload({
          actions: [
            { action_key: "transfer_uang_ke_vendor", title: "Bayar vendor", rationale: "Supaya lancar", payload: {} },
            { action_key: "enqueue_sales_coaching", title: "Coaching Budi", rationale: "Backlog terbesar ada di Budi", payload: { sales_name: "Budi" } },
          ],
        }),
      ),
    );

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action_key).toBe("enqueue_sales_coaching");
    expect(result.notes.join(" ")).toContain("transfer_uang_ke_vendor");
    expect(result.situasi).toBeTruthy();
  });

  it("drops an action missing its rationale — an approver cannot judge what it does not explain", () => {
    const result = parseAnalysis(
      JSON.stringify(validPayload({ actions: [{ action_key: "enqueue_sales_coaching", title: "Coaching", payload: {} }] })),
    );

    expect(result.actions).toEqual([]);
    expect(result.notes.join(" ")).toContain("alasan");
  });

  it("caps proposed actions at four", () => {
    const action = (n: number) => ({ action_key: "enqueue_content_performance_broadcast", title: `Aksi ${n}`, rationale: "alasan", payload: {} });
    const result = parseAnalysis(JSON.stringify(validPayload({ actions: [1, 2, 3, 4, 5, 6].map(action) })));

    expect(result.actions).toHaveLength(4);
    expect(result.notes.join(" ")).toContain("dipotong");
  });

  it("flags a briefing that offered fewer than three alternatives", () => {
    const result = parseAnalysis(JSON.stringify(validPayload({ solusi: [validPayload().solusi[0]] })));

    expect(result.solusi).toHaveLength(1);
    expect(result.notes.join(" ")).toContain("minimal 3");
  });

  it("labels a solution that claims no downside rather than rendering it blank", () => {
    const result = parseAnalysis(
      JSON.stringify(validPayload({ solusi: [{ judul: "Naikkan budget", ringkasan: "Tambah 30%", keuntungan: "Lead naik", dampak: "tinggi" }] })),
    );

    expect(result.solusi[0].kerugian).toContain("tidak disebutkan");
  });

  it("falls back to a safe severity when the model invents one", () => {
    const result = parseAnalysis(JSON.stringify(validPayload({ severity: "bencana" })));

    expect(result.severity).toBe("perhatian");
    expect(result.notes.join(" ")).toContain("bencana");
  });

  it("derives a headline from the situation when one is missing", () => {
    const result = parseAnalysis(JSON.stringify(validPayload({ headline: "" })));

    expect(result.headline.length).toBeGreaterThan(0);
    expect(result.headline.length).toBeLessThanOrEqual(120);
  });
});
