import { describe, expect, it } from "vitest";

import { biayaKode, biayaNama, biayaPeriodeLabel, biayaPeriodeOptions, formatRupiah, parseNominal, sniffBiayaFile } from "@/lib/connect/biaya";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string, pad = 0) => new Uint8Array([...s].map((c) => c.charCodeAt(0)).concat(Array(pad).fill(0)));

describe("sniffBiayaFile", () => {
  it("recognises JPEG, PNG, WebP and PDF by their bytes", () => {
    expect(sniffBiayaFile(bytes(0xff, 0xd8, 0xff, 0xe0))?.contentType).toBe("image/jpeg");
    expect(sniffBiayaFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe("png");
    const webp = ascii("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffBiayaFile(webp)?.contentType).toBe("image/webp");
    expect(sniffBiayaFile(ascii("%PDF-1.7"))?.contentType).toBe("application/pdf");
  });

  it("rejects anything else, whatever its name says", () => {
    expect(sniffBiayaFile(ascii("<html><script>"))).toBeNull();
    expect(sniffBiayaFile(ascii("<svg xmlns"))).toBeNull();
    expect(sniffBiayaFile(bytes())).toBeNull();
  });
});

describe("biaya labels", () => {
  it("names a request like the villa app does", () => {
    expect(biayaKode(12)).toBe("PB-0012");
    expect(biayaNama("lain_lain", "Gas elpiji")).toBe("Gas elpiji");
    expect(biayaNama("laundry", null)).toBe("Laundry");
    expect(formatRupiah(350000)).toBe("Rp350.000");
    expect(biayaPeriodeLabel("2026-11")).toBe("November 2026");
  });

  it("offers this month and last month in Jakarta time", () => {
    // 2026-11-01 00:30 WIB is still 2026-10-31 in UTC
    expect(biayaPeriodeOptions(new Date("2026-10-31T17:30:00Z"))).toEqual(["2026-11", "2026-10"]);
    expect(biayaPeriodeOptions(new Date("2027-01-10T03:00:00Z"))).toEqual(["2027-01", "2026-12"]);
  });

  it("parses typed amounts", () => {
    expect(parseNominal("Rp 350.000")).toBe(350000);
    expect(parseNominal("abc")).toBeNull();
    expect(parseNominal("0")).toBeNull();
  });
});
