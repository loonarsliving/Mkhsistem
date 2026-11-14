import { describe, expect, it } from "vitest";

import { hitungPeriode, susunRingkasanHarga, type BookingRow, type MasukanHarga } from "@/lib/advisor/revenue-summary";
import { isPublicPath } from "@/lib/supabase/middleware";

const b = (unit_id: string, tgl_checkin: string, tgl_checkout: string, tarif: number, status = "terjadwal"): BookingRow => ({
  unit_id,
  status,
  tgl_checkin,
  tgl_checkout,
  tarif,
  property_kode: "PL",
});

describe("advisor revenue summary", () => {
  it("is reachable without a session (secret checked in the route)", () => {
    expect(isPublicPath("/api/advisor/harga")).toBe(true);
  });

  it("counts only nights inside the period and only sold statuses", () => {
    const p = hitungPeriode("x", "2026-11-10", "2026-11-12", 2, [
      b("u1", "2026-11-09", "2026-11-11", 500_000), // malam 10 saja
      b("u2", "2026-11-11", "2026-11-15", 700_000), // malam 11, 12
      b("u1", "2026-11-11", "2026-11-12", 900_000, "batal"),
    ]);
    expect(p.malamTersedia).toBe(6);
    expect(p.malamTerjual).toBe(3);
    expect(p.okupansiPct).toBe(50);
    expect(p.adr).toBe(Math.round((500_000 + 2 * 700_000) / 3));
    expect(p.revpar).toBe(Math.round((500_000 + 2 * 700_000) / 6));
  });

  it("splits properties, reports engine settings, and never invents occupancy for an empty property", () => {
    const m: MasukanHarga = {
      hariIni: "2026-11-14",
      booking: [b("u1", "2026-11-14", "2026-11-16", 600_000)],
      unit: [
        { id: "u1", status: "available", room_type_id: "t1", property_kode: "PL" },
        { id: "e1", status: "maintenance", room_type_id: "t2", property_kode: "EL" },
      ],
      tipe: [
        { id: "t1", code: "standard", name: "Standard", property_kode: "PL", base_rate: 500000, min_rate: 500000, max_rate: 1000000, active: true },
        { id: "t2", code: "DOU", name: "Double", property_kode: "EL", base_rate: 300000, min_rate: 300000, max_rate: 550000, active: true },
      ],
      harga: [
        { room_type_id: "t1", date: "2026-11-14", rate: 600000 },
        { room_type_id: "t1", date: "2026-11-15", rate: 700000 },
      ],
      kompetitor: [{ room_type_id: "t1", location_label: "Sleman", competitor_type: "villa", price: 800000, observed_at: "2026-11-01" }],
      rekomendasi: [{ status: "rejected", delta_pct: 0.1, generated_at: "2026-11-10T01:00:00Z" }],
      setelan: [{ high_occupancy_threshold_pct: 80, low_occupancy_threshold_pct: 30, max_daily_movement_pct: 0.15, ai_autopush_enabled: true, active: true }],
      musim: [{ label: "Natal", start_date: "2026-12-20", end_date: "2027-01-02", suggested_adjustment_pct: 0.2, active: true }],
      sumber: {},
    };
    const r = susunRingkasanHarga(m);
    expect(r.properti.map((p) => p.kode)).toEqual(["EL", "PL"]);
    const pl = r.properti.find((p) => p.kode === "PL")!;
    expect(pl.kedepan[0].malamTerjual).toBe(2);
    expect(pl.tipe[0].harga30Hari).toEqual({ hari: 2, min: 600000, median: 650000, maks: 700000 });
    expect(pl.tipe[0].kompetitor60Hari.median).toBe(800000);
    expect(r.mesin).toMatchObject({ ambangOkupansiTinggiPct: 80, ambangOkupansiRendahPct: 30, gerakHarianMaksPct: 15, autopushAktif: true, rekomendasi30Hari: { rejected: 1 } });
    expect(r.musimRamai[0].saranPenyesuaianPct).toBe(20);
    expect(r.catatan.join(" ")).toMatch(/Semua unit EL berstatus maintenance/);
  });
});
