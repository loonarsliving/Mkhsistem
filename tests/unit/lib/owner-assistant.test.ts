import { describe, expect, it } from "vitest";

import {
  formatOkupansiKeDepan,
  formatRingkasanKeuangan,
  isOwnerMenuRequest,
  parseOwnerIntentJson,
  tambahBulan,
  tanggalWib,
  type RingkasanKeuangan,
} from "@/lib/ai/domains/owner-assistant";

describe("parseOwnerIntentJson", () => {
  it("keeps known tools and valid parameters", () => {
    const intent = parseOwnerIntentJson(
      '```json\n{"isDataQuestion": true, "tools": ["keuangan_ringkasan", "villa_okupansi_ke_depan", "attendance_today"], "branchName": "Jogja", "bulanDari": "2026-09", "bulanSampai": "2026-10", "tanggalMulai": "2026-10-20", "jumlahHari": 7}\n```',
    );
    expect(intent).toEqual({
      isDataQuestion: true,
      tools: ["keuangan_ringkasan", "villa_okupansi_ke_depan", "attendance_today"],
      branchName: "Jogja",
      bulanDari: "2026-09",
      bulanSampai: "2026-10",
      tanggalMulai: "2026-10-20",
      jumlahHari: 7,
    });
  });

  it("drops invented tools and malformed parameters instead of guessing", () => {
    const intent = parseOwnerIntentJson(
      '{"isDataQuestion": true, "tools": ["hapus_semua", "loonars2_saldo"], "bulanDari": "Oktober", "bulanSampai": "2026-13", "tanggalMulai": "besok", "jumlahHari": 90}',
    );
    expect(intent.tools).toEqual(["loonars2_saldo"]);
    expect(intent.bulanDari).toBeNull();
    expect(intent.bulanSampai).toBeNull();
    expect(intent.tanggalMulai).toBeNull();
    expect(intent.jumlahHari).toBe(14);
  });

  it("treats anything but literal true as not a data question", () => {
    expect(parseOwnerIntentJson('{"isDataQuestion": "true", "tools": ["lead_stats"]}').isDataQuestion).toBe(false);
  });
});

describe("date helpers", () => {
  it("uses the WIB calendar day", () => {
    expect(tanggalWib(new Date("2026-10-18T17:30:00Z"))).toBe("2026-10-19");
    expect(tanggalWib(new Date("2026-10-18T16:59:00Z"))).toBe("2026-10-18");
  });

  it("moves across year boundaries", () => {
    expect(tambahBulan("2026-01", -2)).toBe("2025-11");
    expect(tambahBulan("2026-12", 1)).toBe("2027-01");
  });
});

describe("isOwnerMenuRequest", () => {
  it("matches only a bare menu/help word", () => {
    expect(isOwnerMenuRequest("Menu")).toBe(true);
    expect(isOwnerMenuRequest(" bantuan? ")).toBe(true);
    expect(isOwnerMenuRequest("menu baru cafe apa saja")).toBe(false);
  });
});

describe("formatOkupansiKeDepan", () => {
  it("sums villa-api's per-room-type counts per date", () => {
    const text = formatOkupansiKeDepan([
      { date: "2026-10-19", roomTypeName: "Standard", totalUnits: 10, occupiedUnits: 6 },
      { date: "2026-10-19", roomTypeName: "Sawah View", totalUnits: 4, occupiedUnits: 1 },
      { date: "2026-10-20", roomTypeName: "Standard", totalUnits: 10, occupiedUnits: 0 },
    ]);
    expect(text).toContain("2026-10-19: 7/14 terisi (50%) -- Standard 6/10, Sawah View 1/4");
    expect(text).toContain("2026-10-20: 0/10 terisi (0%)");
  });
});

describe("formatRingkasanKeuangan", () => {
  const ringkasan: RingkasanKeuangan = {
    rentang: "Oktober 2026",
    diambil_pada: "2026-10-18T03:00:00Z",
    gabungan: {
      pendapatan: 150_000_000,
      beban_pokok: 20_000_000,
      beban_operasional: 30_000_000,
      laba_bersih: 100_000_000,
      total_aset: 900_000_000,
      total_liabilitas: 300_000_000,
      total_ekuitas: 600_000_000,
      kas_akhir: 250_000_000,
    },
    tren: [{ periode: "2026-10", label: "Okt 2026", pendapatan: 150_000_000, laba: 100_000_000, kas: 250_000_000 }],
    unit: [
      {
        kode: "villa-jogja",
        nama: "Loonars Private Living",
        jenis: "operasi_properti",
        kota: "Yogyakarta",
        utang_bank: [{ jenis: "KPR", bank: "BTN", sisa: 50_000_000, jatuhTempo: "2030-01-01" }],
        bulan: [
          { periode: "2026-09", status: "belum_mulai", buku_besar: null, metrik: {} },
          {
            periode: "2026-10",
            status: "sebagian",
            buku_besar: { pendapatan: 80_000_000, beban: 10_000_000, laba: 70_000_000, kas: 5_000_000 },
            metrik: { okupansi_unit_total_pct: 62.5, pendapatan_kotor: 75_000_000, adr_kotor: null },
            pendapatan_villa: { rental: 60_000_000, non_kamar: 4_000_000, total: 64_000_000 },
          },
        ],
      },
    ],
    temuan: [{ tingkat: "info", unit: null, teks: "Akun di luar bagan akun: 5-9999." }],
  };

  it("copies the numbers and labels missing metrics as unavailable, never zero", () => {
    const text = formatRingkasanKeuangan(ringkasan);
    expect(text).toContain("laba bersih Rp100.000.000");
    expect(text).toContain("kas Rp250.000.000");
    expect(text).toContain("okupansi 62,5%");
    expect(text).toContain("pendapatan kamar kotor Rp75.000.000");
    expect(text).toContain("ADR belum tersedia");
    expect(text).toContain("pendapatan villa (sync bulanan) sewa kamar Rp60.000.000, non-kamar Rp4.000.000, total Rp64.000.000");
    expect(text).toContain("Utang bank KPR BTN: sisa Rp50.000.000");
    expect(text).toContain("Akun di luar bagan akun");
    expect(text).not.toContain("2026-09 [belum_mulai]");
  });

  it("says so when there is no journal in the range", () => {
    expect(formatRingkasanKeuangan({ ...ringkasan, gabungan: null, tren: [], unit: [], temuan: [] })).toContain("belum ada jurnal");
  });
});

describe("formatRingkasanKeuangan without villa metrics", () => {
  it("collapses a month with no operating metrics into one line", () => {
    const text = formatRingkasanKeuangan({
      rentang: "September 2026",
      diambil_pada: "2026-10-18T03:00:00Z",
      gabungan: null,
      tren: [],
      unit: [
        {
          kode: "loonars-1",
          nama: "Loonars Private Living",
          jenis: "operasi_properti",
          kota: null,
          utang_bank: [],
          bulan: [
            {
              periode: "2026-09",
              status: "sebagian",
              buku_besar: null,
              metrik: { okupansi_unit_total_pct: null, adr_kotor: null },
              pendapatan_villa: { rental: 21_678_356.95, non_kamar: 320_000, total: 21_998_356.95 },
            },
          ],
        },
      ],
      temuan: [],
    });
    expect(text).toContain("metrik operasi bulanan (okupansi/ADR) belum tersedia");
    expect(text).not.toContain("ADR belum tersedia");
    expect(text).toContain("sewa kamar Rp21.678.357");
  });
});
