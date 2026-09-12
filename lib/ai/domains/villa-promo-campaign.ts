import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Villa: promo lewat WhatsApp (permintaan owner 2026-09-12).
 *
 * Modul ini hanya TRANSPOR. Seluruh logikanya -- siapa penerimanya, apa
 * isinya, apakah usulannya masih berlaku, dan pengirimannya sendiri --
 * ada di villa-api, karena di sanalah database tamu tinggal. Daftar nomor
 * tamu tidak pernah melewati berkas ini.
 *
 * Tiga balasan yang dikenali:
 *
 *  - "PROMO <6 hex>" dari owner  -> setujui usulan, villa-api mengirimkan
 *  - "TOLAK <6 hex>" dari owner  -> tolak usulan
 *  - "BERHENTI" dari siapa pun   -> tamu itu berhenti langganan promo
 *
 * Dua yang pertama dikunci ke nomor super admin yang aktif, sama seperti
 * LUNAS: tanpa itu, siapa pun yang menebak enam karakter bisa menyuruh
 * sistem mengirim promo ke seluruh database tamu.
 *
 * "BERHENTI" sengaja TIDAK dikunci ke siapa pun. Orang yang minta berhenti
 * dikirimi pesan harus selalu bisa berhenti; memintanya membuktikan diri
 * dulu adalah cara paling pasti membuat orang memblokir nomor kita.
 */

const VILLA_API_BASE = "https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/villa-api";

const PROMO_RE = /^\s*promo\s+([0-9a-f]{6})\s*$/i;
const TOLAK_RE = /^\s*(?:tolak|batal)\s+([0-9a-f]{6})\s*$/i;
const BERHENTI_RE = /^\s*(?:berhenti|stop|unsubscribe)\s*$/i;

export type VillaPromoOutcome = { outcome: "not_applicable" } | { outcome: "handled"; reply: string };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Sama seperti di villa-payment-confirmation: owner adalah super admin aktif di employees. */
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

async function callVilla(path: string, body: unknown): Promise<Record<string, unknown> | null> {
  const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (!secret) {
    logger.error("villa promo: VILLA_BRIDGE_SECRET belum dikonfigurasi");
    return null;
  }
  try {
    const res = await fetch(`${VILLA_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      logger.error("villa promo: villa-api menolak panggilan", { path, status: res.status });
      return null;
    }
    return json;
  } catch (e) {
    logger.error("villa promo: villa-api tidak bisa dihubungi", { path, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function tryVillaPromoViaWhatsApp(sender: string, text: string): Promise<VillaPromoOutcome> {
  // ── tamu berhenti langganan ────────────────────────────────────────────
  if (BERHENTI_RE.test(text)) {
    const body = await callVilla("/bridge/guest-opt-out", { hp: sender });
    if (body?.success === true) {
      return {
        outcome: "handled",
        reply: "Baik, kami tidak akan mengirimkan info promo lagi ke nomor ini. Terima kasih, dan pintu kami tetap terbuka kalau suatu saat ingin menginap lagi.",
      };
    }
    // Nomor yang tidak ada di database tamu tetap dijawab ramah, bukan
    // "tamu tidak ditemukan": orangnya hanya ingin berhenti dikirimi pesan.
    return {
      outcome: "handled",
      reply: "Baik, permintaan Anda kami catat. Kalau masih menerima pesan dari kami, mohon balas sekali lagi ya.",
    };
  }

  const promo = text.match(PROMO_RE);
  const tolak = text.match(TOLAK_RE);
  if (!promo && !tolak) return { outcome: "not_applicable" };

  // Dicek hanya setelah pesannya memang berbentuk perintah, supaya pesan
  // biasa dari siapa pun tidak pernah membebani dua kueri ini.
  if (!(await isVillaOwner(sender))) {
    logger.warn("villa promo: perintah promo dari nomor yang bukan owner villa, diabaikan");
    return { outcome: "not_applicable" };
  }

  if (tolak) {
    const kode = tolak[1].toUpperCase();
    const body = await callVilla("/bridge/promo-reject", { kode });
    if (body?.success === true) return { outcome: "handled", reply: `Baik, usulan promo ${kode} dibatalkan. Tidak ada pesan yang dikirim ke tamu.` };
    if (body?.reason === "sudah_terkirim") return { outcome: "handled", reply: `Usulan ${kode} sudah terlanjur dikirim, jadi tidak bisa dibatalkan lagi.` };
    return { outcome: "handled", reply: `Usulan ${kode} tidak ditemukan. Mohon cek lagi kodenya.` };
  }

  const kode = promo![1].toUpperCase();
  const body = await callVilla("/bridge/promo-approve", { kode });
  if (!body) return { outcome: "handled", reply: `Gagal memproses ${kode}: server villa tidak bisa dihubungi. Belum ada pesan yang dikirim ke tamu.` };

  if (body.success === true && body.already_sent === true) {
    return { outcome: "handled", reply: `Usulan ${kode} sudah dikirim sebelumnya. Tidak ada yang dikirim ulang.` };
  }

  if (body.success === true) {
    const terkirim = Number(body.terkirim ?? 0);
    const sisa = Number(body.sisa ?? 0);
    const gagal = Number(body.gagal ?? 0);
    const nama = (body.promo as Record<string, unknown> | undefined)?.nama ?? "-";
    let reply = `Siap, promo "${nama}" dikirim ke ${terkirim} tamu.`;
    if (gagal > 0) reply += `\n${gagal} gagal dicatat.`;
    if (sisa > 0) reply += `\n\nMasih ada ${sisa} tamu dalam antrean — balas PROMO ${kode} sekali lagi untuk melanjutkan.`;
    return { outcome: "handled", reply };
  }

  const alasan: Record<string, string> = {
    not_found: `Kode ${kode} tidak ditemukan.`,
    kedaluwarsa: `Usulan ${kode} sudah kedaluwarsa (lewat 48 jam), jadi tidak dikirim. Alasan yang membuatnya diusulkan kemungkinan sudah berubah.`,
    ditolak: `Usulan ${kode} sudah Bapak tolak sebelumnya.`,
    promo_tidak_aktif: `Promonya sudah tidak aktif, jadi ${kode} tidak dikirim.`,
    invalid_code: `Kode ${kode} tidak dikenali formatnya.`,
  };
  return { outcome: "handled", reply: alasan[String(body.reason ?? "")] ?? `Kode ${kode} tidak bisa diproses.` };
}
