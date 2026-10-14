import { describe, expect, it } from "vitest";

import { parseBahanRecognition } from "@/lib/ai/domains/loonars2-bahan-recognition";

describe("parseBahanRecognition", () => {
  it("reads items, quantities and per-item unit notes", () => {
    const hasil = parseBahanRecognition(
      JSON.stringify({
        toko: "TB Maju",
        utang: false,
        nominal: 5_000_000,
        items: [
          { nama: "besi 10mm", qty: 60, satuan: "batang", nilai: 3_000_000, untukUnit: [1, 2, 3] },
          { nama: "keramik", qty: 30, satuan: "dus", nilai: 2_000_000, untukUnit: null },
        ],
        notes: "",
      }),
    );
    expect(hasil.toko).toBe("TB Maju");
    expect(hasil.nominal).toBe(5_000_000);
    expect(hasil.items[0]).toEqual({ nama: "besi 10mm", qty: 60, satuan: "batang", nilai: 3_000_000, untukUnit: [1, 2, 3] });
    expect(hasil.items[1].untukUnit).toBeNull();
  });

  it("sums item prices only when every item has one; otherwise leaves the total unknown", () => {
    const lengkap = parseBahanRecognition(JSON.stringify({ items: [{ nama: "a", nilai: 100 }, { nama: "b", nilai: 250 }] }));
    expect(lengkap.nominal).toBe(350);
    const sebagian = parseBahanRecognition(JSON.stringify({ items: [{ nama: "a", nilai: 100 }, { nama: "b" }] }));
    expect(sebagian.nominal).toBeNull();
  });

  it("drops junk: unnamed items, non-positive numbers, out-of-range units", () => {
    const hasil = parseBahanRecognition(
      JSON.stringify({ utang: "ya", items: [{ nama: "" }, { nama: "semen", qty: -3, nilai: 0, untukUnit: [0, 100, 2.5, "3", 4, 4] }, 7, null] }),
    );
    expect(hasil.utang).toBe(false);
    expect(hasil.items).toEqual([{ nama: "semen", qty: null, satuan: null, nilai: null, untukUnit: [4] }]);
  });

  it("strips a markdown fence and rejects non-JSON", () => {
    expect(parseBahanRecognition('```json\n{"utang": true, "items": []}\n```').utang).toBe(true);
    expect(() => parseBahanRecognition("bukan json")).toThrow();
  });
});
