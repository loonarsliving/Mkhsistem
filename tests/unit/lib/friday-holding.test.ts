import { describe, expect, it } from "vitest";

import { __holdingTestables } from "@/lib/ai/friday/holding";
import { CONNECTOR_KINDS, isKnownConnectorKind } from "@/lib/ai/friday/connectors/registry";
import { HOLDING_METRIC_KEYS } from "@/lib/ai/friday/connectors/types";
import type { BusinessSnapshot } from "@/lib/ai/friday/connectors/types";

const { parseHoldingAnalysis, parseBusinessHealth } = __holdingTestables;

/**
 * The group-level failure worth testing is not a malformed JSON blob — that is
 * already covered by the single-business parser these functions reuse. It is
 * a business being MISJUDGED: a unit whose dashboard was down being reported
 * to the board as a failing unit. One such briefing would cost the group
 * report its credibility permanently, so the correction is asserted directly.
 */

function snapshot(key: string, health: BusinessSnapshot["health"]): BusinessSnapshot {
  return {
    businessKey: key,
    businessName: `Unit ${key}`,
    businessType: "villa",
    capturedAt: new Date().toISOString(),
    health,
    metrics: [],
    narrative: null,
    note: health === "unreachable" ? "Dashboard tidak dapat dihubungi" : null,
  };
}

function validHolding(overrides: Record<string, unknown> = {}) {
  return {
    headline: "Grup ditopang satu unit, tiga unit lain tertinggal",
    severity: "perhatian",
    situasi: "Empat unit aktif, tiga terbaca dan satu tidak dapat dihubungi.",
    analisa: "Pola mangkraknya follow-up muncul di dua unit sekaligus, mengarah ke satu masalah disiplin operasional grup.",
    risiko: "Kalau dibiarkan sebulan, konsentrasi pendapatan pada satu unit membuat grup rapuh terhadap satu kejadian tunggal.",
    solusi: [
      { judul: "Standarkan follow-up", ringkasan: "Terapkan SOP follow-up unit terbaik ke unit lain", keuntungan: "Cepat", kerugian: "Butuh pelatihan", biaya_estimasi: "Rendah", dampak: "tinggi" },
      { judul: "Fokuskan modal", ringkasan: "Prioritaskan unit dengan margin terbaik", keuntungan: "ROI jelas", kerugian: "Unit lain melambat", biaya_estimasi: "Tidak ada", dampak: "sedang" },
      { judul: "Perbaiki koneksi data", ringkasan: "Benahi connector unit yang tidak terbaca", keuntungan: "Visibilitas penuh", kerugian: "Butuh waktu teknis", biaya_estimasi: "Rendah", dampak: "sedang" },
    ],
    rekomendasi: "Ambil solusi 3 lebih dulu karena dua solusi lain bertumpu pada data unit yang saat ini tidak terbaca.",
    hasil_diharapkan: "Seluruh unit terbaca dalam 7 hari.",
    business_health: [],
    actions: [],
    ...overrides,
  };
}

describe("FRIDAY holding analysis", () => {
  it("forces an unreachable business to data_tidak_tersedia even when the model calls it critical", () => {
    const notes: string[] = [];
    const result = parseBusinessHealth(
      [{ business_key: "villa", status: "kritis", ringkasan: "Tidak ada pendapatan", temuan_utama: "Unit mati", prioritas: 1 }],
      [snapshot("villa", "unreachable")],
      notes,
    );

    expect(result[0].status).toBe("data_tidak_tersedia");
    expect(notes.join(" ")).toContain("dikoreksi");
  });

  it("keeps a genuine verdict when the business was actually readable", () => {
    const notes: string[] = [];
    const result = parseBusinessHealth(
      [{ business_key: "villa", status: "kritis", ringkasan: "Okupansi anjlok", temuan_utama: "Okupansi 12%", prioritas: 1 }],
      [snapshot("villa", "ok")],
      notes,
    );

    expect(result[0].status).toBe("kritis");
    expect(notes).toEqual([]);
  });

  it("appends a business the model skipped rather than dropping it from the group report", () => {
    const notes: string[] = [];
    const result = parseBusinessHealth([{ business_key: "villa", status: "sehat", ringkasan: "Baik", temuan_utama: "Stabil", prioritas: 1 }], [snapshot("villa", "ok"), snapshot("kos", "ok")], notes);

    expect(result.map((r) => r.business_key).sort()).toEqual(["kos", "villa"]);
    expect(notes.join(" ")).toContain("kos");
  });

  it("discards a business the model invented", () => {
    const notes: string[] = [];
    const result = parseBusinessHealth(
      [
        { business_key: "villa", status: "sehat", ringkasan: "Baik", temuan_utama: "Stabil", prioritas: 1 },
        { business_key: "kasino_monaco", status: "kritis", ringkasan: "Rugi", temuan_utama: "Rugi besar", prioritas: 2 },
      ],
      [snapshot("villa", "ok")],
      notes,
    );

    expect(result).toHaveLength(1);
    expect(notes.join(" ")).toContain("kasino_monaco");
  });

  it("orders businesses by the priority the analysis assigned", () => {
    const notes: string[] = [];
    const result = parseBusinessHealth(
      [
        { business_key: "kos", status: "sehat", ringkasan: "a", temuan_utama: "b", prioritas: 3 },
        { business_key: "villa", status: "kritis", ringkasan: "c", temuan_utama: "d", prioritas: 1 },
      ],
      [snapshot("villa", "ok"), snapshot("kos", "ok")],
      notes,
    );

    expect(result.map((r) => r.business_key)).toEqual(["villa", "kos"]);
  });

  it("holds a group briefing to the same required sections as a single-business one", () => {
    const payload = validHolding();
    delete (payload as Record<string, unknown>).risiko;

    expect(() => parseHoldingAnalysis(JSON.stringify(payload), [snapshot("villa", "ok")])).toThrow();
  });

  it("parses a complete group briefing and covers every business in the snapshot", () => {
    const result = parseHoldingAnalysis(
      JSON.stringify(
        validHolding({
          business_health: [{ business_key: "villa", status: "sehat", ringkasan: "Kuat", temuan_utama: "Okupansi 85%", prioritas: 1 }],
        }),
      ),
      [snapshot("villa", "ok"), snapshot("kos", "unreachable")],
    );

    expect(result.solusi).toHaveLength(3);
    expect(result.businessHealth).toHaveLength(2);
    expect(result.businessHealth.find((b) => b.business_key === "kos")?.status).toBe("data_tidak_tersedia");
  });
});

describe("FRIDAY connector registry", () => {
  it("knows exactly the connector kinds the database constraint allows", () => {
    // Mirrors holding_businesses.connector_kind in migration 0182. Adding a
    // kind in code without widening that constraint would fail every insert.
    expect([...CONNECTOR_KINDS].sort()).toEqual(["http", "internal_mkh"]);
  });

  it("refuses an unknown connector kind", () => {
    expect(isKnownConnectorKind("internal_mkh")).toBe(true);
    expect(isKnownConnectorKind("ftp_dropbox")).toBe(false);
  });

  it("keeps the shared metric vocabulary stable — these keys are what makes cross-business comparison possible", () => {
    expect(HOLDING_METRIC_KEYS.REVENUE).toBe("revenue");
    expect(HOLDING_METRIC_KEYS.CASH_BALANCE).toBe("cash_balance");
    expect(HOLDING_METRIC_KEYS.UTILIZATION).toBe("utilization");
    expect(new Set(Object.values(HOLDING_METRIC_KEYS)).size).toBe(Object.values(HOLDING_METRIC_KEYS).length);
  });
});
