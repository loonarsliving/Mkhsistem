import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/supabase/middleware";
import { NOTA_BEDA_RE, parseRekeningBalasan, pisahRekening, TRANSFER_BEDA_RE, parseBarisMingguan, parseBorongan, parseLoonars2Perintah, parseRupiah, parseUnit, parseUnits } from "@/lib/ai/domains/loonars2-wa";

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
      teks: "TB Maju unit 5 semen 50 sak 6.500.000",
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

  it("kepala 'pengajuan pembayaran' bukan baris tersendiri", () => {
    const p = parseLoonars2Perintah("L2 pengajuan pembayaran\n• Material pasir dan split 4.365.000");
    expect(p?.aksi).toBe("ajukan_mingguan");
    const baris = ((p as unknown as { data: unknown }).data as { baris: { nominal: number | null; deskripsi: string }[] }).baris;
    expect(baris).toHaveLength(1);
    expect(baris[0].nominal).toBe(4365000);
    expect(baris[0].deskripsi).toMatch(/pasir dan split/i);
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
    expect((hasil as unknown as { data: { baris: unknown[] } }).data.baris).toHaveLength(2);
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

describe("unit ranges", () => {
  it("expands ranges and mixed lists", () => {
    expect(parseUnits("unit 1-6")).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(parseUnits("unit 1-3,5")).toEqual(["1", "2", "3", "5"]);
    expect(parseUnits("unit 4 sampai 6")).toEqual(["4", "5", "6"]);
    expect(parseUnits("blok 7 dan 8")).toEqual(["7", "8"]);
    expect(parseUnits("unit 5,6 dan 7")).toEqual(["5", "6", "7"]);
    expect(parseUnits("unit 6-2")).toEqual([]);
    expect(parseUnits("unit 1-99")).toEqual([]);
  });
});

describe("borongan tukang (upah mingguan)", () => {
  it("'tukang minggu ini' is a weekly line without amount (system computes it)", () => {
    expect(parseLoonars2Perintah("L2 tukang minggu ini")).toEqual({
      aksi: "ajukan_mingguan",
      data: { baris: [{ jenis: "tukang", unit: [], deskripsi: "tukang minggu ini", toko: undefined, nominal: null }] },
    });
    const lengkap = parseLoonars2Perintah("L2 pengajuan minggu ini\n- tukang minggu ini\n- cicilan TB Maju 3 juta\n- retensi unit 2");
    expect(lengkap).toMatchObject({ aksi: "ajukan_mingguan" });
    const baris = (lengkap as unknown as { data: { baris: { jenis: string; unit?: string[]; nominal: number | null }[] } }).data.baris;
    expect(baris.map((b) => b.jenis)).toEqual(["tukang", "cicilan", "retensi"]);
    expect(baris[0].nominal).toBeNull();
    expect(baris[2].unit).toEqual(["2"]);
  });

  it("a contractor line with unit and amount stays a per-unit payment", () => {
    expect(parseBarisMingguan("- kontraktor Pak Anang unit 5,6 15 juta")).toMatchObject({ jenis: "tukang", unit: ["5", "6"], nominal: 15_000_000 });
  });

  it("owner creates a borongan; the same word does not hijack a weekly line", () => {
    expect(parseBorongan("L2 borongan Pak Anang unit 1-6 35 juta retensi 9 juta 12 minggu")).toEqual({
      aksi: "borongan",
      data: { nama: "Pak Anang", unit: ["1", "2", "3", "4", "5", "6"], nilai: 35_000_000, retensi: 9_000_000, minggu: 12 },
    });
    expect(parseLoonars2Perintah("L2 borongan Pak Anang unit 1-6 35jt retensi 9jt 12 minggu")).toMatchObject({ aksi: "borongan" });
    expect(parseBorongan("L2 borongan")).toEqual({ aksi: "daftar_borongan", data: {} });
    expect(parseBorongan("L2 borongan Pak Anang minggu ini")).toBeNull();
    expect(parseLoonars2Perintah("L2 borongan Pak Anang minggu ini")).toMatchObject({ aksi: "ajukan_mingguan" });
    expect(parseBorongan("borongan Pak Anang unit 1-6 35 juta 12 minggu")).toBeNull(); // wajib berawalan L2
  });
});

describe("unit sedang dibangun, bahan kolektif, koreksi, RAB", () => {
  it("answers 'which units are being built' with only unit numbers", () => {
    expect(parseLoonars2Perintah("L2 unit 1-6")).toEqual({ aksi: "unit_dibangun", data: { unit: ["1", "2", "3", "4", "5", "6"] } });
    expect(parseLoonars2Perintah("L2 unit 1,2,3 dan 7")).toEqual({ aksi: "unit_dibangun", data: { unit: ["1", "2", "3", "7"] } });
    // pengajuan satuan lama tetap pengajuan
    expect(parseLoonars2Perintah("L2 unit 5 semen 20 sak 1.300.000 TB Maju")).toMatchObject({ aksi: "ajukan_ai", unit: "5" });
  });

  it("reads a collective material order (no unit) and an explicit utang flag", () => {
    expect(parseLoonars2Perintah("L2 bahan TB Maju semen 100 sak, pasir 12 rit 8,5 juta")).toEqual({
      aksi: "bahan_ai",
      teks: "TB Maju semen 100 sak, pasir 12 rit 8,5 juta",
      utang: false,
      unit: [],
    });
    expect(parseLoonars2Perintah("L2 bahan utang TB Maju cat 3 juta")).toMatchObject({ aksi: "bahan_ai", utang: true });
    expect(parseLoonars2Perintah("L2 bahan TB Maju besi untuk unit 1-3 3 juta")).toMatchObject({ aksi: "bahan_ai", unit: ["1", "2", "3"] });
  });

  it("utang without a unit is a collective order (database asks which units)", () => {
    expect(parseLoonars2Perintah("L2 utang TB Maju semen 50 sak 6.500.000")).toMatchObject({ aksi: "utang_foto", unit: [], nominal: 6_500_000 });
  });

  it("koreksi moves a bahan to specific units; rab shows usage", () => {
    expect(parseLoonars2Perintah("L2 koreksi M-7 semen unit 1,2,3")).toEqual({
      aksi: "koreksi_bahan",
      data: { kode: "M-7", item: "semen", unit: ["1", "2", "3"] },
    });
    expect(parseLoonars2Perintah("L2 koreksi U-2 unit 4-5")).toEqual({ aksi: "koreksi_bahan", data: { kode: "U-2", item: null, unit: ["4", "5"] } });
    expect(parseLoonars2Perintah("L2 rab")).toEqual({ aksi: "rab", data: {} });
    expect(parseLoonars2Perintah("L2 rab unit 3")).toEqual({ aksi: "rab", data: { unit: "3" } });
    expect(parseLoonars2Perintah("rab unit 3")).toBeNull(); // wajib berawalan L2
  });
});

describe("pembayaran lain-lain & cicilan utang", () => {
  it("operational costs are 'lain' without needing a unit", () => {
    expect(parseBarisMingguan("- listrik proyek 600 rb")).toMatchObject({ jenis: "lain", unit: [], nominal: 600_000 });
    expect(parseBarisMingguan("- lain sewa scaffolding 1,5 juta")).toMatchObject({ jenis: "lain", nominal: 1_500_000 });
    expect(parseBarisMingguan("- bensin 200 rb")).toMatchObject({ jenis: "lain", nominal: 200_000 });
    expect(parseBarisMingguan("- semen 20 sak 1.300.000 TB Maju")).toMatchObject({ jenis: "material" });
  });

  it("one-line shortcuts for lain and cicilan (with or without amount)", () => {
    expect(parseLoonars2Perintah("L2 lain listrik proyek 600 rb")).toMatchObject({ aksi: "ajukan_mingguan", data: { baris: [{ jenis: "lain", nominal: 600_000 }] } });
    expect(parseLoonars2Perintah("L2 bensin 200 rb")).toMatchObject({ aksi: "ajukan_mingguan" });
    expect(parseLoonars2Perintah("L2 cicilan TB Maju lunas")).toMatchObject({
      aksi: "ajukan_mingguan",
      data: { baris: [{ jenis: "cicilan", toko: "TB Maju", deskripsi: "cicilan TB Maju lunas", nominal: null }] },
    });
    expect(parseLoonars2Perintah("L2 cicilan TB Maju 3 juta")).toMatchObject({ data: { baris: [{ jenis: "cicilan", toko: "TB Maju", nominal: 3_000_000 }] } });
  });

  it("kata 'nota beda' / 'bukan double' menandai nota yang memang lain", () => {
    expect(NOTA_BEDA_RE.test("L2 utang Sedia Nurut semen 5 juta nota beda")).toBe(true);
    expect(NOTA_BEDA_RE.test("L2 utang Sedia Nurut besi 5 juta bukan double")).toBe(true);
    expect(NOTA_BEDA_RE.test("L2 utang Sedia Nurut besi 5 juta")).toBe(false);
  });

  it("permintaan laporan utang (PDF) dikenali dengan atau tanpa awalan L2", () => {
    for (const m of ["kirim laporan utang loonars 2 pdf", "laporan pembayaran utang", "L2 laporan utang", "pdf utang toko", "tolong kirimkan rekap utang toko dalam bentuk pdf", "utang loonars 2 pdf"]) {
      expect(parseLoonars2Perintah(m)).toEqual({ aksi: "laporan_utang", data: {} });
    }
  });

  it("kalimat lain tentang utang tidak dianggap permintaan laporan", () => {
    expect(parseLoonars2Perintah("utang")).toEqual({ aksi: "daftar_utang", data: {} });
    expect(parseLoonars2Perintah("laporan keuangan villa")).toBeNull();
    expect(parseLoonars2Perintah("bayar utang toko besi 9 juta")).toBeNull();
  });

  it("kata 'transfer beda' menandai transfer lain walau nominal & penerima sama", () => {
    expect(TRANSFER_BEDA_RE.test("cicilan utang toko, transfer beda")).toBe(true);
    expect(TRANSFER_BEDA_RE.test("ini bukan double")).toBe(true);
    expect(TRANSFER_BEDA_RE.test("Ini bukti bayar cicil utang toko di tgl 10 oktober 2026")).toBe(false);
  });

  it("rekening dipisah dari tulisan supaya nomor rekening tidak terbaca sebagai nominal", () => {
    const b = parseBarisMingguan("- Reimburse mas sarno 972.000 BCA 1234567890 a.n. Sarno");
    expect(b?.nominal).toBe(972000);
    expect(b?.rekening).toContain("1234567890");
    expect(b?.deskripsi).not.toContain("1234567890");
    const c = parseBarisMingguan("Cicilan Toko Besi & Kaca SEDIA NURUT 15 jt");
    expect(c?.nominal).toBe(15000000);
    expect(c?.rekening).toBeUndefined();
    const d = parseBarisMingguan("Pasir 1,5 jt");
    expect(d?.nominal).toBe(1500000);
  });

  it("pisahRekening: bank + nomor, nomor + bank, dan angka biasa", () => {
    expect(pisahRekening("mami ini rekeningku ya REBECCA DINDA PRASAS Bank Mandiri 1640009977150").rekening).not.toBeNull();
    expect(pisahRekening("BCA 037-301-1441 a.n. Anang").rekening).not.toBeNull();
    expect(pisahRekening("transfer ke 7855066190 BCA a/n Irfan").rekening).not.toBeNull();
    expect(pisahRekening("pasir 2 rit 1.600.000").rekening).toBeNull();
    expect(pisahRekening("bca 1234567890 972.000").sisa).toContain("972.000");
  });

  it("balasan rekening: satu baris, bernomor, dan teks lain tidak diambil", () => {
    expect(parseRekeningBalasan("BCA 1234567890 a.n. Sarno")).toEqual([{ no: null, rekening: "BCA 1234567890 a.n. Sarno" }]);
    expect(parseRekeningBalasan("1. BCA 1234567890 a.n. Sarno\n2. Mandiri 9876543210 a.n. Toko Maju")).toEqual([
      { no: 1, rekening: "BCA 1234567890 a.n. Sarno" },
      { no: 2, rekening: "Mandiri 9876543210 a.n. Toko Maju" },
    ]);
    expect(parseRekeningBalasan("halo pak, besok saya kirim")).toBeNull();
    expect(parseRekeningBalasan("saya sudah transfer 500 rb, ini buktinya")).toBeNull();
  });

  it("balasan rekening dan 'tanpa rekening' dikenali tanpa awalan L2; teks biasa tetap null", () => {
    expect(parseLoonars2Perintah("BCA 1234567890 a.n. Sarno")?.aksi).toBe("rekening");
    expect(parseLoonars2Perintah("L2 tanpa rekening")?.aksi).toBe("tanpa_rekening");
    expect(parseLoonars2Perintah("selamat pagi")).toBeNull();
  });

  it("kalimat pembelian dengan rekening adalah pengajuan, bukan balasan rekening", () => {
    const a = parseLoonars2Perintah("L2 pembelian cat 495.000 Mandiri 1850 0066 1464 5 Sarno");
    expect(a?.aksi).toBe("ajukan_mingguan");
    const baris = (a as unknown as { data: { baris: { nominal: number | null; rekening?: string }[] } }).data.baris;
    expect(baris[0].nominal).toBe(495000);
    expect(baris[0].rekening).toContain("1850 0066 1464 5");
    expect(parseLoonars2Perintah("L2 pembelian cat loonars 1 495.000 BCA 0600492233 Wibowo")?.aksi).toBe("ajukan_mingguan");
    expect(parseLoonars2Perintah("L2 beli semen 10 sak 650.000 BCA 1234567890 a.n. Toko Maju")?.aksi).toBe("ajukan_mingguan");
  });

  it("balasan rekening murni tetap dikenali; kalimat dengan nominal tidak", () => {
    expect(parseLoonars2Perintah("Mandiri 1850 0066 1464 5 a.n. Sarno")?.aksi).toBe("rekening");
    expect(parseLoonars2Perintah("2. BCA 0600492233 Wibowo")?.aksi).toBe("rekening");
    expect(parseRekeningBalasan("pembelian cat 495.000 BCA 0600492233 Wibowo")).toBeNull();
  });
});


describe("pengajuan Vando 31 Okt 2026 (awalan nyasar & nama rekening di tengah)", () => {
  it("rekening dengan nama di antara bank dan nomor terbaca, ditulis ulang bank -> nomor -> a.n.", () => {
    const r = pisahRekening("bahan (no drop, semen putih, lem fox, solasi, fiber no drop) 392.000 bank Mandiri Sarno 1850 0066 1464 5");
    expect(r.rekening).toContain("Mandiri 1850 0066 1464 5 a.n. Sarno");
    expect(r.sisa).toContain("392.000");
    expect(r.sisa).not.toContain("1850");
    expect(parseRupiah(r.sisa)).toBe(392_000);
  });

  it("nama di tengah tidak salah tangkap kata biasa / angka nominal", () => {
    expect(pisahRekening("pasir 2 rit 1.600.000").rekening).toBeNull();
    expect(pisahRekening("BCA no rek 1234567890").rekening).not.toBeNull();
    expect(pisahRekening("bayar BCA unit 5 1.300.000").rekening).toBeNull();
  });

  it("pengajuan lengkap dengan rekening nama di tengah tidak lagi kekurangan rekening", () => {
    const p = parseLoonars2Perintah(
      "L2 pengajuan minggu ini\n• Cicilan Toko besi & kaca sedia nurut 15 juta Bank Danamon 903692710811 a.n. Papang\n• pasir 3,5 juta BCA 8466119208 a.n. Nanang\n• bahan (no drop, semen putih, lem fox, solasi, fiber no drop) 392.000 bank Mandiri Sarno 1850 0066 1464 5",
    );
    expect(p?.aksi).toBe("ajukan_mingguan");
    const baris = (p as unknown as { data: { baris: { nominal: number | null; rekening?: string }[] } }).data.baris;
    expect(baris.map((b) => b.nominal)).toEqual([15_000_000, 3_500_000, 392_000]);
    expect(baris.every((b) => b.rekening)).toBe(true);
    expect(baris[2].rekening).toContain("a.n. Sarno");
  });

  it("kata nyasar sebelum \"L2 pengajuan\" di pesan berbaris dibuang", () => {
    const p = parseLoonars2Perintah(
      "Bank Mandiri L2 pengajuan minggu ini\n• Cicilan Toko besi & kaca sedia nurut 15 juta Bank Danamon 903692710811 a.n. Papang\n• Pasir & matrial 5.897.000 BCA 7855066190 Naimuddin Irfan",
    );
    expect(p?.aksi).toBe("ajukan_mingguan");
    const baris = (p as unknown as { data: { baris: { nominal: number | null; rekening?: string }[] } }).data.baris;
    expect(baris.map((b) => b.nominal)).toEqual([15_000_000, 5_897_000]);
    expect(baris.every((b) => b.rekening)).toBe(true);
  });

  it("pertanyaan satu baris yang menyebut L2 tidak dibaca sebagai pengajuan", () => {
    expect(parseLoonars2Perintah("kenapa L2 pengajuan vando tidak masuk")).toBeNull();
    expect(parseLoonars2Perintah("berapa saldo loonars 2")).toBeNull();
    expect(parseLoonars2Perintah("Halo kak\nmau tanya villa")).toBeNull();
  });
});

describe("L2 tidak di depan (satu baris)", () => {
  it("pengajuan bernominal dengan kata nyasar dibalas petunjuk, bukan dilempar ke asisten umum", async () => {
    const { tryHandleLoonars2Text, L2_TIDAK_DI_AWAL } = await import("@/lib/ai/domains/loonars2-wa");
    await expect(tryHandleLoonars2Text("62800", "Bank Mandiri L2 cicilan TB Maju 3 juta")).resolves.toEqual({ outcome: "handled", reply: L2_TIDAK_DI_AWAL });
    await expect(tryHandleLoonars2Text("62800", "kenapa L2 pengajuan vando tidak masuk")).resolves.toEqual({ outcome: "not_applicable" });
  });
});
