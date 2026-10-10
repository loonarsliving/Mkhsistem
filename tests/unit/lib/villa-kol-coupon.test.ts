import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { buildKolReply, parseKolCommand } from "@/lib/ai/domains/villa-kol-coupon";

describe("parseKolCommand", () => {
  it("reads 'KOL <akun> <malam>', any case, default 1 night", () => {
    expect(parseKolCommand("KOL @atmojoae 1")).toEqual({ aksi: "buat", untuk: "@atmojoae", malam: 1 });
    expect(parseKolCommand("Kol @atmojoae")).toEqual({ aksi: "buat", untuk: "@atmojoae", malam: 1 });
    expect(parseKolCommand("kol Rina Nose 3")).toEqual({ aksi: "buat", untuk: "Rina Nose", malam: 3 });
  });

  it("reads LIST and BATAL", () => {
    expect(parseKolCommand("KOL LIST")).toEqual({ aksi: "list" });
    expect(parseKolCommand("kol batal kol-abc234")).toEqual({ aksi: "batal", kode: "KOL-ABC234" });
  });

  it("ignores ordinary messages and a malformed BATAL", () => {
    expect(parseKolCommand("kolam renangnya dalam berapa?")).toBeNull();
    expect(parseKolCommand("KOL")).toBeNull();
    expect(parseKolCommand("KOL batal x")).toBeNull();
    expect(parseKolCommand("LUNAS A3F2C1")).toBeNull();
  });
});

describe("buildKolReply", () => {
  const buat = { aksi: "buat" as const, untuk: "@atmojoae", malam: 1 };

  it("shows the new code and the last check-in date", () => {
    const text = buildKolReply(
      buat,
      { success: true, kupon: { kode: "KOL-CH3JWC", untuk: "@atmojoae", malam_gratis: 1, berlaku_sampai: "2027-01-09" } },
      "2026-10-09",
    );
    expect(text).toContain("KOL-CH3JWC");
    expect(text).toContain("1 malam gratis");
    expect(text).toContain("2027");
    expect(text).toContain("kamar kosong");
  });

  it("returns null when villa-api says the sender is not the owner", () => {
    expect(buildKolReply(buat, { success: false, reason: "bukan_owner" }, "2026-10-09")).toBeNull();
  });

  it("reports an unreachable villa-api instead of staying silent", () => {
    expect(buildKolReply(buat, null, "2026-10-09")).toContain("tidak bisa dihubungi");
  });

  it("lists used, cancelled, expired and open coupons", () => {
    const text = buildKolReply(
      { aksi: "list" },
      {
        success: true,
        kupon: [
          { kode: "KOL-AAAAAA", untuk: "a", malam_gratis: 1, aktif: true, berlaku_sampai: "2027-01-01", dipakai: { guest_nama: "A", unit_nomor: "B2", tgl_checkin: "2026-10-20" } },
          { kode: "KOL-BBBBBB", untuk: "b", malam_gratis: 2, aktif: false, berlaku_sampai: "2027-01-01", dipakai: null },
          { kode: "KOL-CCCCCC", untuk: "c", malam_gratis: 1, aktif: true, berlaku_sampai: "2026-01-01", dipakai: null },
          { kode: "KOL-DDDDDD", untuk: "d", malam_gratis: 1, aktif: true, berlaku_sampai: "2027-01-01", dipakai: null },
        ],
      },
      "2026-10-09",
    )!;
    expect(text).toContain("✅ dipakai A, unit B2");
    expect(text).toContain("⛔ dibatalkan");
    expect(text).toContain("⌛ kedaluwarsa");
    expect(text).toContain("🟢 belum dipakai");
  });
});
