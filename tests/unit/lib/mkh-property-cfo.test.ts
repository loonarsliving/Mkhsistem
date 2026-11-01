import { describe, expect, it } from "vitest";

import { tandaAiCfoSah } from "@/lib/security/mkh-property-cfo";
import { isPublicPath } from "@/lib/supabase/middleware";

// Tanda tangan dihasilkan oleh Postgres (extensions.hmac, sama dengan RPC
// cfo_tanda_ai MKH Property) untuk body & rahasia uji di bawah.
const BODY = '{"sistem":"s","pengguna":"p"}';
const SIG_POSTGRES = "23d672975af50700a382281728e0e5b136087363d127427587ad1ef5e0c4ac8c";
const TS = "1762000000";

describe("tandaAiCfoSah (AI CFO MKH Property → layanan AI MK Connect)", () => {
  it("menerima tanda tangan buatan Postgres (format lintas sistem cocok)", () => {
    expect(tandaAiCfoSah("rahasia-uji", TS, SIG_POSTGRES, BODY, 1762000100)).toBe(true);
  });

  it("menolak body yang diubah, rahasia lain, dan tanda tangan kedaluwarsa", () => {
    expect(tandaAiCfoSah("rahasia-uji", TS, SIG_POSTGRES, BODY.replace("p", "q"), 1762000100)).toBe(false);
    expect(tandaAiCfoSah("rahasia-lain", TS, SIG_POSTGRES, BODY, 1762000100)).toBe(false);
    expect(tandaAiCfoSah("rahasia-uji", TS, SIG_POSTGRES, BODY, 1762000000 + 301)).toBe(false);
    expect(tandaAiCfoSah("rahasia-uji", TS, "zz", BODY, 1762000100)).toBe(false);
    expect(tandaAiCfoSah("", TS, SIG_POSTGRES, BODY, 1762000100)).toBe(false);
  });

  it("route narasi bisa dicapai tanpa sesi login (verifikasi di route)", () => {
    expect(isPublicPath("/api/mkh-property/ai-cfo/narasi")).toBe(true);
  });
});
