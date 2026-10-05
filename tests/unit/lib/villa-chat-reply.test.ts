import { describe, expect, it } from "vitest";

import { buildUserPrompt, parseChatReply } from "@/lib/ai/domains/villa-chat-reply";

describe("parseChatReply", () => {
  it("accepts a plain answer", () => {
    const r = parseChatReply('{"kategori":"jawab","draf":"Check-in mulai pukul 15.00 ya Kak☺️🙏","cek_tanggal":null,"alasan":"jam check-in dari pengetahuan"}');
    expect(r).toEqual({ kategori: "jawab", draf: "Check-in mulai pukul 15.00 ya Kak☺️🙏", cek_tanggal: null, alasan: "jam check-in dari pengetahuan" });
  });

  it("strips a markdown fence", () => {
    const r = parseChatReply('```json\n{"kategori":"komplain","draf":"Mohon maaf Kak","alasan":"gas habis"}\n```');
    expect(r.kategori).toBe("komplain");
  });

  it("requires a valid range for a date check", () => {
    const ok = parseChatReply('{"kategori":"cek_tanggal","draf":"Sebentar ya Kak","cek_tanggal":{"checkin":"2026-10-10","checkout":"2026-10-11"}}');
    expect(ok.cek_tanggal).toEqual({ checkin: "2026-10-10", checkout: "2026-10-11" });
    expect(() => parseChatReply('{"kategori":"cek_tanggal","draf":"x","cek_tanggal":{"checkin":"2026-10-11","checkout":"2026-10-10"}}')).toThrow();
    expect(() => parseChatReply('{"kategori":"cek_tanggal","draf":"x","cek_tanggal":null}')).toThrow();
  });

  it("ignores cek_tanggal on other categories", () => {
    const r = parseChatReply('{"kategori":"jawab","draf":"x","cek_tanggal":{"checkin":"2026-10-10","checkout":"2026-10-11"}}');
    expect(r.cek_tanggal).toBeNull();
  });

  it("rejects unknown categories and empty drafts", () => {
    expect(() => parseChatReply('{"kategori":"diskon","draf":"x"}')).toThrow();
    expect(() => parseChatReply('{"kategori":"jawab","draf":"  "}')).toThrow();
    expect(() => parseChatReply("bukan json")).toThrow();
  });
});

describe("buildUserPrompt", () => {
  it("lists availability with exact prices and full room types", () => {
    const p = buildUserPrompt({
      pengetahuan: "Check-in 15.00",
      sekarang: "2026-10-05 14:03 (Senin)",
      riwayat: [{ arah: "masuk", isi: "tgl 10 ada?", waktu: "2026-10-05 14:02" }],
      ketersediaan: {
        checkin: "2026-10-10",
        checkout: "2026-10-11",
        tipe: [
          { nama: "Standard", tersedia: 2, malam: 1, harga_per_malam: 706000, harga_total: 706000 },
          { nama: "Sawah View", tersedia: 0, malam: 1, harga_per_malam: null, harga_total: null },
        ],
      },
    });
    expect(p).toContain("Standard: TERSEDIA (2 unit), 1 malam, rata-rata Rp706.000/malam, total Rp706.000");
    expect(p).toContain("Sawah View: PENUH");
    expect(p).toContain("TAMU: tgl 10 ada?");
  });

  it("says when there is no availability data yet", () => {
    const p = buildUserPrompt({ pengetahuan: "x", sekarang: "now", riwayat: [{ arah: "masuk", isi: "halo" }] });
    expect(p).toContain("DATA KETERSEDIAAN:\n(belum ada)");
  });
});
