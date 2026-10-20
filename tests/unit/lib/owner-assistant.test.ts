import { describe, expect, it } from "vitest";

import type { RefundCustomer } from "@/repositories/refund.repository";

import {
  formatHargaVilla,
  formatKeuanganVilla,
  formatOkupansiKeDepan,
  formatRefund,
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
    expect(
      parseOwnerIntentJson('{"isDataQuestion": "true", "tools": ["lead_stats"]}').isDataQuestion,
    ).toBe(false);
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
    tren: [
      {
        periode: "2026-10",
        label: "Okt 2026",
        pendapatan: 150_000_000,
        laba: 100_000_000,
        kas: 250_000_000,
      },
    ],
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
            buku_besar: {
              pendapatan: 80_000_000,
              beban: 10_000_000,
              laba: 70_000_000,
              kas: 5_000_000,
            },
            metrik: {
              okupansi_unit_total_pct: 62.5,
              pendapatan_kotor: 75_000_000,
              adr_kotor: null,
            },
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
    expect(text).toContain(
      "pendapatan villa (sync bulanan) sewa kamar Rp60.000.000, non-kamar Rp4.000.000, total Rp64.000.000",
    );
    expect(text).toContain("Utang bank KPR BTN: sisa Rp50.000.000");
    expect(text).toContain("Akun di luar bagan akun");
    expect(text).not.toContain("2026-09 [belum_mulai]");
  });

  it("says so when there is no journal in the range", () => {
    expect(
      formatRingkasanKeuangan({ ...ringkasan, gabungan: null, tren: [], unit: [], temuan: [] }),
    ).toContain("belum ada jurnal");
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

describe("formatKeuanganVilla", () => {
  const dasar = {
    bulan: "2026-10",
    hari_ini: "2026-10-18",
    finance: {
      gross_revenue: 40_000_000,
      net_revenue: 34_000_000,
      payment_received: 30_000_000,
      outstanding: 10_000_000,
      ota_receivable: 8_000_000,
      bookings_counted: 55,
      cancelled_excluded: 3,
      pipeline: { amount: 12_000_000, count: 20 },
      cash_received: { amount: 0, verified: false, count: 0 },
      alerts: [{ message: "2 settlement sudah lewat tanggal perkiraan cair." }],
    },
    channel: {
      channels: [
        {
          sumber: "agoda",
          booking_count: 30,
          room_nights: 35,
          revenue: 25_000_000,
          net_revenue: 20_000_000,
          avg_net_adr: 571_428.57,
        },
      ],
      bersih_belum_tersedia: 2,
    },
    laporan_investor: {
      gross_revenue: 38_000_000,
      opex_per_unit: 9_500_000,
      marketing_amount: 10_450_000,
      net: 18_050_000,
      owner_amount: 12_635_000,
      pengelola_amount: 5_415_000,
      investor_count: 13,
      per_investor_amount: 971_923.08,
      jaminan_aktif: true,
      jaminan_topup: 4_028_076.92,
      walkin_income: { cafe: 1_000_000, spa: 0, lainnya: 320_000, total: 1_320_000 },
    },
  };

  it("copies Finance, channel and investor numbers as-is", () => {
    const text = formatKeuanganVilla(dasar);
    expect(text).toContain("[Keuangan Villa 2026-10]");
    expect(text).toContain(
      "kotor Rp40.000.000, bersih (sebelum fee OTA) Rp34.000.000 dari 55 booking (3 batal",
    );
    expect(text).toContain("uang diterima tercatat Finance belum diverifikasi");
    expect(text).toContain(
      "agoda 30 booking/35 malam, kotor Rp25.000.000, bersih Rp20.000.000, ADR bersih Rp571.429",
    );
    expect(text).toContain("2 booking OTA belum punya angka bersih");
    expect(text).toContain(
      "bagian investor Rp12.635.000 untuk 13 investor (Rp971.923 per investor, jaminan aktif: top-up Rp4.028.077 per investor)",
    );
    expect(text).toContain("kafe Rp1.000.000");
    expect(text).toContain("Peringatan Finance: 2 settlement");
  });
});

describe("formatHargaVilla", () => {
  it("shows website and engine prices per room type, and never prices a sold-out type", () => {
    const text = formatHargaVilla([
      {
        date: "2026-10-25",
        rooms: [
          {
            code: "standard",
            name: "Standard",
            total: 10,
            available: 4,
            nights: 1,
            pricePerNightAvg: 405_000,
            priceNormalPerNightAvg: 502_000,
          },
          {
            code: "sawah_view",
            name: "Sawah View",
            total: 3,
            available: 0,
            nights: 1,
            pricePerNightAvg: null,
            priceNormalPerNightAvg: null,
          },
        ],
      },
    ]);
    expect(text).toContain(
      "2026-10-25: Standard: website Rp405.000, harga mesin/dasar Cloudbeds Rp502.000 (4/10 kosong)",
    );
    expect(text).toContain("Sawah View: penuh (0/3 kosong, harga tidak dihitung)");
    expect(text).toContain("tidak tersedia di sistem, jangan ditebak");
  });
});

describe("formatRefund", () => {
  const customer = (over: Partial<RefundCustomer>): RefundCustomer => ({
    id: "c1",
    name: "Budi",
    phone: null,
    refundAmount: 10_000_000,
    openingPaidAmount: 2_000_000,
    paidAmount: 3_000_000,
    remainingAmount: 7_000_000,
    scheduledUnpaidAmount: 4_000_000,
    unscheduledAmount: 3_000_000,
    overScheduled: false,
    bankName: null,
    bankAccountNumber: null,
    bankAccountHolder: null,
    notes: null,
    sortOrder: 0,
    installments: [
      {
        id: "i1",
        customerId: "c1",
        dueMonth: "2026-09-01",
        amount: 1_000_000,
        isPaid: true,
        paidAt: null,
      },
      {
        id: "i2",
        customerId: "c1",
        dueMonth: "2026-10-01",
        amount: 1_000_000,
        isPaid: false,
        paidAt: null,
      },
    ],
    unreadMessages: 2,
    lastMessageAt: null,
    lastReminderAt: null,
    proofs: [],
    ...over,
  });

  it("summarises this month's termin and the overall totals from the repository's own figures", () => {
    const text = formatRefund(
      [
        customer({}),
        customer({
          id: "c2",
          name: "Sari",
          refundAmount: 5_000_000,
          paidAmount: 5_000_000,
          remainingAmount: 0,
          unscheduledAmount: 0,
          unreadMessages: 0,
          installments: [
            {
              id: "i3",
              customerId: "c2",
              dueMonth: "2026-10-01",
              amount: 500_000,
              isPaid: true,
              paidAt: null,
            },
          ],
        }),
      ],
      "2026-10-01",
    );
    expect(text).toContain(
      "Termin jatuh tempo 2026-10: 2 termin, total Rp1.500.000; sudah dibayar 1 termin Rp500.000; belum dibayar 1 termin Rp1.000.000.",
    );
    expect(text).toContain("Budi Rp1.000.000 ⏳ belum");
    expect(text).toContain("Sari Rp500.000 ✅ dibayar");
    expect(text).toContain(
      "Keseluruhan 2 customer: total refund Rp15.000.000, sudah terbayar Rp8.000.000, sisa Rp7.000.000.",
    );
    expect(text).toContain("belum punya jadwal termin: Budi Rp3.000.000");
    expect(text).toContain("Chat customer belum dibaca: Budi (2)");
  });

  it("says so when the module has no customers", () => {
    expect(formatRefund([], "2026-10-01")).toContain("Belum ada customer refund");
  });
});
