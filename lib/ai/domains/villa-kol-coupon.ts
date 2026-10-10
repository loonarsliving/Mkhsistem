import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Villa: owner membuat kupon menginap gratis untuk barter KOL lewat
 * WhatsApp (owner 2026-10-09):
 *
 *   "KOL @akun 2"           -> kupon 2 malam gratis (angka opsional, bawaan 1)
 *   "KOL LIST"              -> daftar kupon dan pemakaiannya
 *   "KOL BATAL KOL-ABC234"  -> matikan kupon yang belum dipakai
 *
 * Seluruh logika kupon (kode, masa berlaku, sekali pakai) ada di villa-api
 * POST /bridge/kol. Modul ini hanya transport, sama seperti LUNAS/PROMO.
 *
 * Dikunci ganda: di sini ke super admin aktif (isVillaOwner, sama dengan
 * LUNAS), dan villa-api memeriksa lagi bahwa `sender` adalah
 * integration_settings.villa_notify.owner_hp -- jadi `sender` WAJIB ikut
 * dikirim. Pesan "kol ..." dari nomor lain jatuh ke jalur biasa tanpa
 * diproses.
 *
 * Dulu perintah ini hanya dipasang di webhook perangkat WA villa, yang
 * tidak menerima pesan apa pun; pesan owner ke 0822 malah dijawab asisten
 * karyawan ("Tidak ditemukan karyawan aktif untuk: Atmojo").
 */

const VILLA_API_BASE = "https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/villa-api";

export type KolCommand =
  | { aksi: "list" }
  | { aksi: "batal"; kode: string }
  | { aksi: "buat"; untuk: string; malam: number };

/** Perintah KOL dari teks, atau null kalau bukan perintah itu. */
export function parseKolCommand(text: string): KolCommand | null {
  if (/^\s*kol\s+list\s*$/i.test(text)) return { aksi: "list" };
  const batal = text.match(/^\s*kol\s+batal\s+(kol-[a-z0-9]{6})\s*$/i);
  if (batal) return { aksi: "batal", kode: batal[1].toUpperCase() };
  if (/^\s*kol\s+batal\b/i.test(text)) return null;
  const buat = text.match(/^\s*kol\s+(.{2,80}?)(?:\s+(\d{1,2}))?\s*$/i);
  if (!buat) return null;
  return { aksi: "buat", untuk: buat[1].trim(), malam: buat[2] ? Number(buat[2]) : 1 };
}

export type VillaKolOutcome = { outcome: "not_applicable" } | { outcome: "handled"; reply: string };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Sama dengan isVillaOwner di villa-payment-confirmation: super admin aktif. */
async function isVillaOwner(sender: string): Promise<boolean> {
  const suffix = digitsOnly(sender).slice(-9);
  if (suffix.length < 9) return false;
  const supabase = createAdminClient();
  const { data: role } = await supabase.from("roles").select("id").eq("key", "super_admin").maybeSingle();
  if (!role?.id) return false;
  const { data: admins } = await supabase
    .from("employees")
    .select("phone")
    .eq("role_id", role.id)
    .eq("is_active", true)
    .not("phone", "is", null);
  return (admins ?? []).some((e) => digitsOnly(e.phone ?? "").endsWith(suffix));
}

export function tanggalId(iso: unknown): string {
  const s = String(iso ?? "");
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Balasan WA untuk jawaban villa-api. null = bukan owner menurut villa-api (diam). */
export function buildKolReply(cmd: KolCommand, b: Record<string, unknown> | null, today: string): string | null {
  if (b?.reason === "bukan_owner") return null;
  if (!b) return "Perintah KOL gagal: server villa tidak bisa dihubungi.";

  if (cmd.aksi === "list") {
    if (b.success !== true) return "Daftar kupon KOL gagal diambil.";
    const kupon = (b.kupon as Array<Record<string, unknown>>) ?? [];
    if (!kupon.length) return "Belum ada kupon KOL.\n\nBuat dengan: KOL @akun 2";
    const baris = kupon.map((k) => {
      const d = k.dipakai as Record<string, unknown> | null;
      const status = d
        ? `✅ dipakai ${d.guest_nama ?? "-"}, unit ${d.unit_nomor ?? "-"}, ${tanggalId(d.tgl_checkin)}`
        : k.aktif !== true
          ? "⛔ dibatalkan"
          : String(k.berlaku_sampai ?? "") < today
            ? "⌛ kedaluwarsa"
            : `🟢 belum dipakai, checkin s/d ${tanggalId(k.berlaku_sampai)}`;
      return `${k.kode} · ${k.untuk} · ${k.malam_gratis} malam\n   ${status}`;
    });
    return `Kupon KOL (30 terbaru)\n\n${baris.join("\n")}`;
  }

  if (cmd.aksi === "batal") {
    if (b.success === true) return `Kupon ${cmd.kode} dibatalkan. Kode ini sudah tidak bisa dipakai di loonars.id.`;
    if (b.reason === "sudah_dipakai")
      return `Kupon ${cmd.kode} sudah dipakai untuk booking, jadi tidak dibatalkan. Batalkan bookingnya dulu dari front desk kalau memang perlu.`;
    return `Kupon ${cmd.kode} tidak ditemukan.`;
  }

  if (b.reason === "malam_tidak_wajar") return "Jumlah malam gratis harus 1 sampai 7.\n\nContoh: KOL @akun 2";
  if (b.reason === "untuk_kosong") return "Tulis nama atau akun KOL-nya.\n\nContoh: KOL @akun 2";
  if (b.success !== true) return `Kupon KOL gagal dibuat (${String(b.detail ?? b.reason ?? "sebab tidak diketahui")}).`;
  const k = (b.kupon ?? {}) as Record<string, unknown>;
  return (
    `Kupon KOL dibuat ✅\n\nKode: ${k.kode}\nUntuk: ${k.untuk} · ${k.malam_gratis} malam gratis\n` +
    `Checkin paling lambat: ${tanggalId(k.berlaku_sampai)}\n\n` +
    `Sekali pakai. Masukkan di loonars.id, kolom Kode Promo. Tetap hanya bisa dipakai kalau ada kamar kosong di tanggal itu.`
  );
}

export async function tryVillaKolCouponViaWhatsApp(sender: string, text: string): Promise<VillaKolOutcome> {
  const cmd = parseKolCommand(text);
  if (!cmd) return { outcome: "not_applicable" };

  if (!(await isVillaOwner(sender))) {
    logger.warn("villa kol: perintah KOL dari nomor yang bukan owner villa, diabaikan");
    return { outcome: "not_applicable" };
  }

  const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (!secret) {
    logger.error("villa kol: VILLA_BRIDGE_SECRET is not configured");
    return { outcome: "handled", reply: "Perintah KOL gagal: jembatan villa belum dikonfigurasi. Mohon hubungi tim teknis." };
  }

  let body: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${VILLA_API_BASE}/bridge/kol`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ ...cmd, sender }),
    });
    body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      logger.error("villa kol: villa-api rejected the call", { status: res.status });
      return { outcome: "handled", reply: `Perintah KOL gagal (HTTP ${res.status}). Silakan coba lagi.` };
    }
  } catch (e) {
    logger.error("villa kol: villa-api unreachable", { error: e instanceof Error ? e.message : String(e) });
  }

  const reply = buildKolReply(cmd, body, new Date().toISOString().slice(0, 10));
  // villa-api menolak karena nomor ini bukan villa_notify.owner_hp, padahal
  // Mkhsistem menganggapnya super admin: beri tahu, jangan diam, supaya
  // owner tidak mengira perintahnya hilang.
  if (reply === null) {
    return {
      outcome: "handled",
      reply: "Nomor ini belum terdaftar sebagai nomor owner di sistem villa, jadi kupon KOL tidak dibuat. Hubungi tim teknis.",
    };
  }
  return { outcome: "handled", reply };
}
