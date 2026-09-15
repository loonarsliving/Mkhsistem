import { describe, expect, it } from "vitest";

import { terbilang, terbilangRupiah } from "@/lib/utils/terbilang";

describe("terbilang", () => {
  it("handles zero and the single digits", () => {
    expect(terbilang(0)).toBe("nol");
    expect(terbilang(1)).toBe("satu");
    expect(terbilang(9)).toBe("sembilan");
  });

  it("uses the Indonesian teen contractions", () => {
    expect(terbilang(10)).toBe("sepuluh");
    expect(terbilang(11)).toBe("sebelas");
    expect(terbilang(12)).toBe("dua belas");
    expect(terbilang(19)).toBe("sembilan belas");
  });

  it("handles tens without a trailing nol", () => {
    expect(terbilang(20)).toBe("dua puluh");
    expect(terbilang(21)).toBe("dua puluh satu");
    expect(terbilang(90)).toBe("sembilan puluh");
  });

  it("uses seratus / seribu rather than satu ratus / satu ribu", () => {
    expect(terbilang(100)).toBe("seratus");
    expect(terbilang(101)).toBe("seratus satu");
    expect(terbilang(150)).toBe("seratus lima puluh");
    expect(terbilang(200)).toBe("dua ratus");
    expect(terbilang(1_000)).toBe("seribu");
    expect(terbilang(1_500)).toBe("seribu lima ratus");
    expect(terbilang(2_000)).toBe("dua ribu");
  });

  it("handles the amounts a booking receipt actually prints", () => {
    // The paper form the owner supplied was pre-printed at Rp 5.000.000; the
    // nominal is now whatever the rep entered, so these are the realistic
    // booking-fee shapes.
    expect(terbilang(5_000_000)).toBe("lima juta");
    expect(terbilang(2_500_000)).toBe("dua juta lima ratus ribu");
    expect(terbilang(10_000_000)).toBe("sepuluh juta");
    expect(terbilang(15_750_000)).toBe("lima belas juta tujuh ratus lima puluh ribu");
    expect(terbilang(101_000)).toBe("seratus satu ribu");
  });

  it("never leaks a stray nol where a group is empty", () => {
    // Regression: an early draft returned "nol" for a zero remainder, so a
    // zero group in the MIDDLE of a number surfaced as a spoken "nol"
    // ("satu miliar dua ratus lima puluh nol juta"). A trailing-word trim
    // could not catch that — the recursion itself has to drop empty groups.
    expect(terbilang(250)).toBe("dua ratus lima puluh");
    expect(terbilang(1_000_500)).toBe("satu juta lima ratus");
    expect(terbilang(2_000_030)).toBe("dua juta tiga puluh");
    expect(terbilang(1_000_000_500)).toBe("satu miliar lima ratus");
  });

  it("handles miliar and triliun scales", () => {
    expect(terbilang(1_000_000_000)).toBe("satu miliar");
    expect(terbilang(1_250_000_000)).toBe("satu miliar dua ratus lima puluh juta");
    expect(terbilang(3_000_000_000_000)).toBe("tiga triliun");
  });

  it("rounds a fractional rupiah amount to the nearest whole rupiah", () => {
    expect(terbilang(5_000_000.4)).toBe("lima juta");
    expect(terbilang(4_999_999.6)).toBe("lima juta");
  });

  it("refuses values it cannot render correctly instead of printing a wrong figure", () => {
    expect(() => terbilang(-1)).toThrow();
    expect(() => terbilang(Number.NaN)).toThrow();
    expect(() => terbilang(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => terbilang(1_000_000_000_000_000)).toThrow();
  });
});

describe("terbilangRupiah", () => {
  it("capitalises the first word and appends rupiah", () => {
    expect(terbilangRupiah(5_000_000)).toBe("Lima juta rupiah");
    expect(terbilangRupiah(0)).toBe("Nol rupiah");
  });
});
