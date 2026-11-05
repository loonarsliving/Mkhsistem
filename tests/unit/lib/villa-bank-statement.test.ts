import { describe, expect, it } from "vitest";

import { parseMutasiReply, parsePayoutReply } from "@/lib/ai/domains/villa-bank-statement";

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

describe("parsePayoutReply", () => {
  it("parses payout rows, keeping the booking number as a string and rounding Net", () => {
    const raw = JSON.stringify({
      readable: true,
      ota: "agoda",
      rows: [
        { nomor: 2054671783, tipe: "Reservation", tamu: "Diah  Ayu", checkin: "2026-09-30", checkout: "2026-10-01", kotor: null, net: "389697.0" },
        { nomor: "2054625441", tamu: "Malinda Mayanti", checkin: "30/09", checkout: "2026-10-01", net: 389697 },
      ],
      total: 779394,
      catatan: "",
    });
    const r = parsePayoutReply(raw);
    expect(r.ota).toBe("agoda");
    expect(r.total).toBe(779394);
    expect(r.rows[0]).toEqual({ nomor: "2054671783", tipe: "Reservation", tamu: "Diah Ayu", checkin: "2026-09-30", checkout: "2026-10-01", kotor: null, net: 389697 });
    // unclear date is blanked, not guessed
    expect(r.rows[1].checkin).toBe("");
  });

  it("drops rows without a booking number or Net, and rejects non-JSON", () => {
    const raw = JSON.stringify({ readable: true, ota: "x", rows: [{ nomor: "", net: 1 }, { nomor: "1", net: "abc" }] });
    const r = parsePayoutReply(raw);
    expect(r.rows).toEqual([]);
    expect(r.ota).toBeNull();
    expect(() => parsePayoutReply("bukan json")).toThrow();
  });
});
