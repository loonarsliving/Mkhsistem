import { describe, expect, it } from "vitest";

import { parseLapkeuCommand } from "@/lib/ai/domains/laporan-investor-wa";

describe("parseLapkeuCommand", () => {
  it("reads lapkeu with no, one, or two months, any case", () => {
    expect(parseLapkeuCommand("lapkeu")).toEqual({});
    expect(parseLapkeuCommand("  LAPKEU  ")).toEqual({});
    expect(parseLapkeuCommand("Lapkeu 2026-09")).toEqual({ sampai: "2026-09" });
    expect(parseLapkeuCommand("lapkeu 2026-09 2026-12")).toEqual({
      dari: "2026-09",
      sampai: "2026-12",
    });
    expect(parseLapkeuCommand("lapkeu 2026-12 2026-09")).toEqual({
      dari: "2026-09",
      sampai: "2026-12",
    });
  });

  it("answers a format hint for malformed arguments", () => {
    expect(parseLapkeuCommand("lapkeu september")).toHaveProperty("error");
    expect(parseLapkeuCommand("lapkeu 2026-13")).toHaveProperty("error");
    expect(parseLapkeuCommand("lapkeu 2026-01 2026-02 2026-03")).toHaveProperty("error");
  });

  it("ignores messages that are not the command", () => {
    expect(parseLapkeuCommand("lapkeuangan")).toBeNull();
    expect(parseLapkeuCommand("tolong kirim lapkeu")).toBeNull();
    expect(parseLapkeuCommand("ya")).toBeNull();
  });
});
