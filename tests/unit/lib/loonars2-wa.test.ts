import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/supabase/middleware";
import { parseBarisMingguan, parseLoonars2Perintah, parseRupiah, parseUnit, parseUnits } from "@/lib/ai/domains/loonars2-wa";

describe("parseRupiah", () => {
  it("reads the ways an owner writes money", () => {
    expect(parseRupiah("210 juta")).toBe(210_000_000);
    expect(parseRupiah("73,8 juta")).toBe(73_800_000);
    expect(parseRupiah("73.8jt")).toBe(73_800_000);
    expect(parseRupiah("1.850.000")).toBe(1_850_000);
    expect(parseRupiah("Rp 210.000.000")).toBe(210_000_000);
    expect(parseRupiah("350rb")).toBe(350_000);
    expect(parseRupiah("1,2 miliar")).toBe(1_200_000_000);
    expect(parseRupiah("1 M")).toBe(1_000_000_000);
  });

  it("takes the largest amount and ignores counts like sak/rit", () => {
    expect(parseRupiah("semen 20 sak 1.300.000")).toBe(1_300_000);
    expect(parseRupiah("pasir 2 rit 5 juta")).toBe(5_000_000);
    expect(parseRupiah("20 sak")).toBeNull();
  });

  it("never reads a length in meters as billions", () => {
    expect(parseRupiah("kabel 10 m 450.000")).toBe(450_000);
  });
});

describe("parseUnit", () => {
  it("reads unit numbers and siteplan codes", () => {
    expect(parseUnit("unit 5, 210 juta")?.ref).toBe("5");
    expect(parseUnit("BANYU-06")?.ref).toBe("BANYU-06");
    expect(parseUnit("banyu 6 semen")?.ref).toBe("BANYU-06");
    expect(parseUnit("lunara-1")?.ref).toBe("LUNARA-01");
    expect(parseUnit("blok A1")).toBeNull();
  });
});

describe("parseLoonars2Perintah", () => {
  it("owner payment commands", () => {
    expect(parseLoonars2Perintah("DP unit 5, 210 juta")).toEqual({ aksi: "receipt", data: { unit: "5", jenis: "dp", nominal: 210_000_000 } });
    expect(parseLoonars2Perintah("pelunasan unit 5")).toEqual({ aksi: "receipt", data: { unit: "5", jenis: "pelunasan" } });
    expect(parseLoonars2Perintah("DP BANYU-06 210jt a.n. Budi Santoso")).toEqual({
      aksi: "receipt",
      data: { unit: "BANYU-06", jenis: "dp", nominal: 210_000_000, nama_pembeli: "Budi Santoso" },
    });
    expect(parseLoonars2Perintah("dp untuk villa saya")).toBeNull();
  });

  it("transfer confirmations", () => {
    expect(parseLoonars2Perintah("sudah 1")).toEqual({ aksi: "konfirmasi_transfer", data: { ref: "1" } });
    expect(parseLoonars2Perintah("Sudah semua")).toEqual({ aksi: "konfirmasi_transfer", data: { ref: "semua" } });
    expect(parseLoonars2Perintah("sudah T15")).toEqual({ aksi: "konfirmasi_transfer", data: { ref: "t15" } });
    expect(parseLoonars2Perintah("sudah transfer B 73,8 juta")).toEqual({
      aksi: "konfirmasi_transfer",
      data: { rekening: "B", nominal: 73_800_000 },
    });
  });

  it("does not steal Loonars Coffee / villa codes", () => {
    // Coffee: SUDAH TRANSFER <hex8>, SETUJUI <hex>; villa: TOLAK/LUNAS <6 hex>
    expect(parseLoonars2Perintah("SUDAH TRANSFER bc12ef34")).toBeNull();
    expect(parseLoonars2Perintah("SETUJUI a1b2c3d4")).toBeNull();
    expect(parseLoonars2Perintah("TOLAK a1b2c3")).toBeNull();
    expect(parseLoonars2Perintah("LUNAS a1b2c3")).toBeNull();
    expect(parseLoonars2Perintah("cocok LAP-0001")).toBeNull();
  });

  it("approvals use L2-<n> or #<n>", () => {
    expect(parseLoonars2Perintah("setujui L2-12")).toEqual({ aksi: "putuskan", data: { id: 12, setuju: true, buffer: false } });
    expect(parseLoonars2Perintah("setujui #12 buffer")).toEqual({ aksi: "putuskan", data: { id: 12, setuju: true, buffer: true } });
    expect(parseLoonars2Perintah("tolak L2-12 alasan harga kemahalan")).toEqual({
      aksi: "putuskan",
      data: { id: 12, setuju: false, alasan: "harga kemahalan" },
    });
  });

  it("account change and profit", () => {
    expect(parseLoonars2Perintah("ubah rekening C BCA 1234 5678 90 a.n. PT Maha Karya")).toEqual({
      aksi: "ubah_rekening",
      data: { rekening: "C", bank: "BCA", nomor: "1234567890", nama: "PT Maha Karya" },
    });
    expect(parseLoonars2Perintah("cairkan profit 200 juta")).toEqual({ aksi: "cairkan_profit", data: { nominal: 200_000_000 } });
  });

  it("bare saldo/tagihan/ya/batal only as whole messages", () => {
    expect(parseLoonars2Perintah("saldo")).toEqual({ aksi: "saldo", data: {} });
    expect(parseLoonars2Perintah("L2 tagihan")).toEqual({ aksi: "tagihan", data: {} });
    expect(parseLoonars2Perintah("YA")).toEqual({ aksi: "ya", data: {} });
    expect(parseLoonars2Perintah("batal")).toEqual({ aksi: "batal", data: {} });
    expect(parseLoonars2Perintah("saldo cabang jogja berapa?")).toBeNull();
    expect(parseLoonars2Perintah("ya saya mau booking villa")).toBeNull();
  });

  it("pelaksana messages need the L2 prefix", () => {
    expect(parseLoonars2Perintah("L2 unit 5 semen 20 sak 1.300.000 TB Maju")).toEqual({
      aksi: "ajukan_ai",
      unit: "5",
      teks: "unit 5 semen 20 sak 1.300.000 TB Maju",
    });
    expect(parseLoonars2Perintah("Loonars 2: bayar L2-7")).toEqual({ aksi: "bayar_pengajuan", data: { id: 7 } });
    expect(parseLoonars2Perintah("L2 halo")).toEqual({ aksi: "bantuan" });
    // Without the prefix a material message is left to the existing flows.
    expect(parseLoonars2Perintah("unit 5 semen 20 sak 1.300.000")).toBeNull();
    expect(parseLoonars2Perintah("Belanja Coffee: semen 5 sak 700rb")).toBeNull();
  });
});

describe("utang toko & pengajuan mingguan", () => {
  it("reads several units", () => {
    expect(parseUnits("kontraktor unit 5,6 dan 7 15 juta")).toEqual(["5", "6", "7"]);
    expect(parseUnits("BANYU-06 & lunara 1")).toEqual(["BANYU-06", "LUNARA-01"]);
  });

  it("parses a store-credit purchase", () => {
    expect(parseLoonars2Perintah("L2 utang TB Maju unit 5 semen 50 sak 6.500.000")).toEqual({
      aksi: "utang_foto",
      unit: ["5"],
      toko: "TB Maju",
      deskripsi: "semen 50 sak",
      nominal: 6_500_000,
    });
    expect(parseLoonars2Perintah("L2 utang Toko Sinar Jaya unit 5,6 besi 10 batang 3,2 juta")).toMatchObject({
      aksi: "utang_foto",
      unit: ["5", "6"],
      toko: "Toko Sinar Jaya",
      nominal: 3_200_000,
    });
    expect(parseLoonars2Perintah("L2 utang")).toEqual({ aksi: "daftar_utang", data: {} });
    expect(parseLoonars2Perintah("utang")).toEqual({ aksi: "daftar_utang", data: {} });
  });

  it("parses a multi-line weekly request, keeping each line", () => {
    const pesan = "L2 pengajuan minggu ini\n- cicilan TB Maju 3 juta\n- kontraktor Pak Anang unit 5,6 15 juta\n- material unit 7 pasir 2 rit 1,6 juta TB Sinar";
    expect(parseLoonars2Perintah(pesan)).toEqual({
      aksi: "ajukan_mingguan",
      data: {
        baris: [
          { jenis: "cicilan", toko: "TB Maju", deskripsi: "cicilan TB Maju 3 juta", nominal: 3_000_000 },
          { jenis: "tukang", unit: ["5", "6"], deskripsi: "kontraktor Pak Anang", toko: undefined, nominal: 15_000_000 },
          { jenis: "material", unit: ["7"], deskripsi: "material pasir 2 rit TB Sinar", toko: "TB Sinar", nominal: 1_600_000 },
        ],
      },
    });
  });

  it("accepts numbered lines and a one-line request", () => {
    const pesan = "L2 pengajuan:\n1. cicilan ke TB Maju Rp 2.500.000\n2) upah tukang unit 12 4 jt";
    const hasil = parseLoonars2Perintah(pesan);
    expect(hasil).toMatchObject({ aksi: "ajukan_mingguan" });
    expect((hasil as { data: { baris: unknown[] } }).data.baris).toHaveLength(2);
    expect(parseLoonars2Perintah("L2 cicilan TB Maju 3 juta")).toEqual({
      aksi: "ajukan_mingguan",
      data: { baris: [{ jenis: "cicilan", toko: "TB Maju", deskripsi: "cicilan TB Maju 3 juta", nominal: 3_000_000 }] },
    });
  });

  it("leaves a missing amount for the database to reject by line number", () => {
    expect(parseBarisMingguan("- kontraktor unit 5")).toMatchObject({ jenis: "tukang", nominal: null });
  });

  it("does not treat an owner buyer-installment as a store installment", () => {
    // "cicilan unit 5 ..." from the owner is a buyer payment (receipt), not store credit.
    expect(parseLoonars2Perintah("cicilan unit 5 50 juta")).toEqual({ aksi: "receipt", data: { unit: "5", jenis: "cicilan", nominal: 50_000_000 } });
  });

  it("owner decisions and payment by code", () => {
    expect(parseLoonars2Perintah("setujui M-3")).toEqual({ aksi: "putuskan_kode", data: { kode: "M-3", setuju: true, buffer: false } });
    expect(parseLoonars2Perintah("setujui u-2 buffer")).toEqual({ aksi: "putuskan_kode", data: { kode: "U-2", setuju: true, buffer: true } });
    expect(parseLoonars2Perintah("tolak C-5 minggu depan saja")).toEqual({ aksi: "putuskan_kode", data: { kode: "C-5", setuju: false, alasan: "minggu depan saja" } });
    expect(parseLoonars2Perintah("L2 bayar M-3")).toEqual({ aksi: "bayar_kelompok", data: { kode: "M-3" } });
    // Coffee/villa hex codes still untouched
    expect(parseLoonars2Perintah("SETUJUI c0ffee12")).toBeNull();
  });
});

describe("outbox route", () => {
  it("is reachable by MKH Property's pg_cron without a login session", () => {
    expect(isPublicPath("/api/loonars2/outbox")).toBe(true);
  });
});
