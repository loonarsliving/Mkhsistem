import { describe, expect, it } from "vitest";

import { contohPesan, namaDepan, samarkanChat, susunRingkasan, waktuBalas, type ChatMessageRow, type InputRingkasan } from "@/lib/advisor/hospitality-summary";
import { isPublicPath } from "@/lib/supabase/middleware";

const pesan = (conversation_id: string, arah: string, menitKe: number, isi = "halo kak"): ChatMessageRow => ({
  conversation_id,
  arah,
  isi,
  terjemahan: null,
  is_perintah_otomatis: false,
  created_at: new Date(Date.UTC(2026, 10, 1, 0, menitKe)).toISOString(),
});

describe("advisor hospitality summary (D-2026-009)", () => {
  it("is reachable server-to-server (own secret check in the route)", () => {
    expect(isPublicPath("/api/advisor/hospitality")).toBe(true);
  });

  it("masks phone numbers, emails and links in guest chat samples", () => {
    expect(samarkanChat("WA saya 0812-3456-7890, email a.b@x.com, lihat https://x.id/a")).toBe("WA saya [nomor], email [email], lihat [tautan]");
    expect(samarkanChat("untuk 2 orang tgl 12")).toBe("untuk 2 orang tgl 12");
    expect(namaDepan("Budi Santoso")).toBe("Budi");
  });

  it("measures reply time per burst of guest messages", () => {
    const r = waktuBalas(
      [pesan("a", "masuk", 0), pesan("a", "masuk", 2), pesan("a", "keluar", 10), pesan("b", "masuk", 0), pesan("b", "keluar", 200), pesan("c", "masuk", 0)],
      new Date(Date.UTC(2026, 10, 1, 5)),
    );
    expect(r.menit).toEqual([10, 200]);
    expect(r.tidakDibalas2Jam).toBe(2);
  });

  it("samples guest messages evenly, at most n", () => {
    const xs = Array.from({ length: 500 }, (_, i) => pesan("a", "masuk", i, `pesan tamu nomor ${i}`));
    const c = contohPesan(xs, 50);
    expect(c).toHaveLength(50);
    expect(c[0]).toBe("pesan tamu nomor 0");
  });

  it("aggregates checklists per staff, missed reports, rework and FO bypass", () => {
    const input: InputRingkasan = {
      dari: "2026-11-01",
      sampai: "2026-11-30",
      sekarang: new Date(Date.UTC(2026, 10, 30)),
      nama: new Map([["e1", "Sari Dewi"], ["e2", "Andi"]]),
      laporan: [
        { report_date: "2026-11-01", data: { exceptions: { missingReports: [{ kind: "security_patrol", label: "Patroli", expected: 3, submitted: 1 }], incompleteChecklists: [{}], missingVerification: [{}, {}] } } },
        { report_date: "2026-11-02", data: { exceptions: { missingReports: [{ kind: "security_patrol", label: "Patroli", expected: 3, submitted: 3 }] } } },
      ],
      checklist: [
        { kind: "cleaning", result: "pass", submitted_by: "e1", report_date: "2026-11-01" },
        { kind: "cleaning", result: "fail", submitted_by: "e1", report_date: "2026-11-02" },
      ],
      tugas: [
        { status: "completed", completion_source: "fo_verified", rework_count: 1, submitted_by: "e1", inspected_by: "e2", started_at: "2026-11-01T01:00:00Z", submitted_at: "2026-11-01T01:40:00Z", inspected_at: "2026-11-01T02:00:00Z" },
        { status: "completed", completion_source: "villa_app", rework_count: 0, submitted_by: null, inspected_by: null, started_at: null, submitted_at: null, inspected_at: null },
      ],
      masalah: [{ category: "guest_complaint", severity: "high", status: "open", assigned_to: null, target_at: "2026-11-10T00:00:00Z", resolved_at: null }],
      cekKamar: [{ hasil: "siap", dicek_oleh_nama: "Rina Putri", property_kode: "PL" }],
      pesan: [pesan("a", "masuk", 0), pesan("a", "keluar", 5)],
      percakapan: [{ id: "a", status_tamu: "prospek", ai_kategori: "harga", property_kode: "PL" }],
      sumber: { laporan_harian: { ok: true }, chat_tamu: { ok: false, error: "x" } },
    };
    const r = susunRingkasan(input);
    expect(r.laporanHarian).toMatchObject({ hariDenganLaporan: 2, checklistBelumLengkap: 1, selesaiTanpaVerifikasiFo: 2 });
    expect(r.laporanHarian.laporanTerlewat).toEqual([{ label: "Patroli", diharapkan: 6, dikirim: 4 }]);
    expect(r.checklistPerStaf).toEqual([{ nama: "Sari", total: 2, perJenis: { cleaning: 2 }, gagalAtauMasalah: 1 }]);
    expect(r.tugasKamar).toMatchObject({ total: 2, lewatAppVillaTanpaFo: 1, totalBersihUlang: 1 });
    expect(r.tugasKamar.perCleaning).toEqual([{ nama: "Sari", dikirim: 1, bersihUlang: 1, medianMenitBersih: 40 }]);
    expect(r.tugasKamar.perFo).toEqual([{ nama: "Andi", inspeksi: 1, medianMenitTungguInspeksi: 20 }]);
    expect(r.masalah).toMatchObject({ terbuka: 1, terlambat: 1, tanpaPenanggungJawab: 1 });
    expect(r.pengecekanKamarVilla.perPengecek).toEqual({ Rina: 1 });
    expect(r.chatTamu).toMatchObject({ pesanMasuk: 1, balasanStaf: 1, medianMenitBalas: 5, perKategoriAi: { harga: 1 } });
    expect(r.catatan[0]).toContain("chat_tamu tidak terbaca");
  });
});
