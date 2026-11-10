import { describe, expect, it } from "vitest";

import { parsePengajuanAi } from "@/lib/ai/domains/loonars2-pengajuan-recognition";

describe("parsePengajuanAi", () => {
  it("membaca baris, membulatkan angka, jenis tak dikenal = material", () => {
    const h = parsePengajuanAi(
      "```json\n" +
        JSON.stringify({
          baris: [
            { deskripsi: "pembayaran air kolam 27 okt", nominal: 350000.4, jenis: "lain", rekening: "BCA 8467112320 Teguh Pramono", unit: [3, 3, 200], total_dp: null },
            { deskripsi: "DP kaca", nominal: 3000000, jenis: "aneh", total_dp: 11652000 },
            { nominal: 1 },
          ],
          rekening_umum: null,
        }) +
        "\n```",
    );
    expect(h.baris).toHaveLength(2);
    expect(h.baris[0]).toMatchObject({ nominal: 350000, jenis: "lain", unit: [3] });
    expect(h.baris[1]).toMatchObject({ jenis: "material", total_dp: 11652000, rekening: null });
  });

  it("bukan JSON: error", () => {
    expect(() => parsePengajuanAi("maaf")).toThrow();
  });
});
