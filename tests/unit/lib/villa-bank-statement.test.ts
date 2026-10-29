import { describe, expect, it } from "vitest";

import { parseMutasiReply } from "@/lib/ai/domains/villa-bank-statement";

describe("parseMutasiReply", () => {
  it("parses rows, rounding amounts and normalising whitespace", () => {
    const raw =
      '```json\n{"readable":true,"bank":"Mandiri","rows":[{"tanggal":"2026-10-29","keterangan":"TRF  BOOKING.COM\\n B.V.","nominal":8954169.4,"arah":"masuk"},{"tanggal":"2026-10-29","keterangan":"Biaya adm","nominal":"12500","arah":"keluar"}],"catatan":""}\n```';
    expect(parseMutasiReply(raw)).toEqual({
      readable: true,
      bank: "Mandiri",
      rows: [
        { tanggal: "2026-10-29", keterangan: "TRF BOOKING.COM B.V.", nominal: 8954169, arah: "masuk" },
        { tanggal: "2026-10-29", keterangan: "Biaya adm", nominal: 12500, arah: "keluar" },
      ],
      catatan: "",
    });
  });

  it("drops rows whose date, amount or direction is unclear instead of guessing", () => {
    const raw = JSON.stringify({
      readable: true,
      rows: [
        { tanggal: "29/10", keterangan: "x", nominal: 1000, arah: "masuk" },
        { tanggal: "2026-10-29", keterangan: "x", nominal: 0, arah: "masuk" },
        { tanggal: "2026-10-29", keterangan: "x", nominal: 1000, arah: "kredit" },
        { tanggal: "2026-10-29", keterangan: "ok", nominal: 1000, arah: "masuk" },
      ],
    });
    expect(parseMutasiReply(raw).rows).toEqual([{ tanggal: "2026-10-29", keterangan: "ok", nominal: 1000, arah: "masuk" }]);
  });

  it("reports an unreadable document and rejects non-JSON", () => {
    expect(parseMutasiReply('{"readable":false,"bank":null,"rows":[],"catatan":"buram"}')).toEqual({
      readable: false,
      bank: null,
      rows: [],
      catatan: "buram",
    });
    expect(() => parseMutasiReply("Berikut mutasinya: ...")).toThrow();
  });
});
