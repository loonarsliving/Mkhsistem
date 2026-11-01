import { describe, expect, it } from "vitest";

import { angkaTakBerdasar, nilaiAngka } from "@/lib/ai/domains/owner-angka";
import { PENGETAHUAN_SISTEM } from "@/lib/ai/domains/owner-knowledge";

describe("nilaiAngka", () => {
  it("membaca format rupiah id-ID dan satuan", () => {
    expect(nilaiAngka("Total Rp 317.574.950 dan 184,4 jt serta 1,49 M; 250rb")).toEqual([
      317_574_950, 184_400_000, 1_490_000_000, 250_000,
    ]);
  });

  it("mengabaikan tahun, tanggal, jam, dan angka kecil", () => {
    expect(nilaiAngka("per 1 November 2026, 2026-11-01, pukul 20.25, 17 unit, 70%")).toEqual([]);
  });
});

describe("angkaTakBerdasar", () => {
  const data = "[AI CFO] TOTAL pengeluaran Rp 317.574.950 = villa Rp 133.172.000 + Loonars Coffee Rp 184.402.950";

  it("angka yang disalin atau dibulatkan wajar lolos", () => {
    expect(angkaTakBerdasar("Total *Rp 317.574.950* (villa Rp 133,2 jt + Coffee Rp 184,4 jt)", data)).toEqual([]);
  });

  it("angka hasil hitungan/karangan model tertangkap", () => {
    expect(angkaTakBerdasar("Sisa budget Rp 50.000.000 dan total Rp 450 jt", data)).toEqual([50_000_000, 450_000_000]);
  });
});

describe("PENGETAHUAN_SISTEM", () => {
  it("memuat keputusan owner kunci dan tidak memuat rahasia/nomor rekening", () => {
    expect(PENGETAHUAN_SISTEM).toMatch(/LOONARS COFFEE .* Loonars 2/);
    expect(PENGETAHUAN_SISTEM).toMatch(/Tidak ada sarapan gratis/);
    expect(PENGETAHUAN_SISTEM).toMatch(/AFP .* IH .* GCI .* GCR .* KDI/s);
    expect(nilaiAngka(PENGETAHUAN_SISTEM)).toEqual([]);
    expect(PENGETAHUAN_SISTEM).not.toMatch(/\d{6,}/);
  });
});
