import { describe, expect, it } from "vitest";

import { splitNumber } from "@/components/shared/animated-value";

describe("splitNumber", () => {
  it("memecah rupiah bertitik ribuan", () => {
    expect(splitNumber("Rp 1.250.000")).toEqual({ prefix: "Rp ", value: 1250000, suffix: "", grouped: true });
  });

  it("memecah persen dan angka polos", () => {
    expect(splitNumber("85%")).toMatchObject({ value: 85, suffix: "%" });
    expect(splitNumber("12 karyawan")).toMatchObject({ value: 12, suffix: " karyawan" });
  });

  it("menolak teks tanpa angka atau dengan lebih dari satu angka", () => {
    expect(splitNumber("—")).toBeNull();
    expect(splitNumber("12/15")).toBeNull();
    expect(splitNumber("Rp 1,2 M")).toBeNull();
    expect(splitNumber("08:15")).toBeNull();
  });

  it("tidak menambah pemisah ribuan pada angka yang aslinya tanpa titik", () => {
    expect(splitNumber("2026")?.grouped).toBe(false);
  });
});
